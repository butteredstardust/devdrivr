// Synthetic mouse driver for native-UI debugging of the Tauri window.
//
// Build:  swiftc -O -o /tmp/mouse apps/cockpit/scripts/native-ui/mouse.swift
// Usage:  /tmp/mouse permissions          # check Accessibility, and ask for it if missing
//         /tmp/mouse move     <x> <y>
//         /tmp/mouse click    <x> <y>
//         /tmp/mouse dblclick <x> <y>
//         /tmp/mouse drag     <x1> <y1> <x2> <y2>
//
// Coordinates are global screen points with the origin at the TOP-LEFT (same space AppleScript's
// `position` returns), not AppKit's bottom-left space.
//
// Requires Accessibility permission for the terminal/agent posting the events
// (System Settings -> Privacy & Security -> Accessibility). Without it the events are silently
// dropped and every test looks like "the app ignores clicks" — so run `permissions` first, and
// every other command refuses up front rather than reporting a false negative about the app.
//
// Why a compiled helper rather than `cliclick` or AppleScript `click at`: this sets
// `.mouseEventClickState` explicitly, which is what makes `e.detail === 2` arrive in the DOM.
// Tauri's injected drag script (tauri-2.x/src/window/scripts/drag.js) keys macOS zoom-on-double-
// click off exactly that value, so a helper that leaves clickState at 1 can never reproduce it.

import ApplicationServices
import CoreGraphics
import Foundation

/// Is the *responsible* process trusted for Accessibility? Passing `prompt: true` is the only way
/// to make macOS show the approval dialog — TCC never raises one off a dropped CGEvent, which is
/// why the missing grant is so easy to mistake for an app bug.
///
/// The grant lands on the app at the top of the process tree, not on this binary: run from a VS
/// Code terminal it is "Visual Studio Code" that appears in the Accessibility list, from Terminal
/// it is "Terminal". Approving the wrong row leaves the events dropping exactly as before.
func isTrusted(prompt: Bool) -> Bool {
    let key = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
    return AXIsProcessTrustedWithOptions([key: prompt] as CFDictionary)
}

/// Refuse rather than post events that will be swallowed. Exit 3 is distinct from the usage exit so
/// a caller can tell "you held it wrong" from "the machine won't let me".
func requireTrust() {
    guard !isTrusted(prompt: false) else { return }
    FileHandle.standardError.write(
        Data(
            """
            mouse: no Accessibility permission — events would be posted and silently dropped.
            Run `mouse permissions` and approve the prompt, then re-run.\n
            """.utf8)
    )
    exit(3)
}

func post(_ type: CGEventType, _ point: CGPoint, clickState: Int64 = 1) {
    guard
        let event = CGEvent(
            mouseEventSource: nil,
            mouseType: type,
            mouseCursorPosition: point,
            mouseButton: .left
        )
    else { return }
    event.setIntegerValueField(.mouseEventClickState, value: clickState)
    event.post(tap: .cghidEventTap)
}

func move(_ point: CGPoint) {
    post(.mouseMoved, point)
}

/// One press/release pair. `clickState` 1 is a single click, 2 the second click of a double click.
func click(_ point: CGPoint, clickState: Int64 = 1) {
    post(.leftMouseDown, point, clickState: clickState)
    usleep(30_000)
    post(.leftMouseUp, point, clickState: clickState)
}

func doubleClick(_ point: CGPoint) {
    click(point, clickState: 1)
    usleep(60_000)  // comfortably inside the system double-click interval
    click(point, clickState: 2)
}

/// Press, walk to the target in interpolated steps, release.
///
/// The intermediate `.leftMouseDragged` events matter: AppKit edge-resize tracking and Tauri's
/// `startDragging` both need motion while the button is held. A straight down/up at two different
/// points moves nothing and reads as "drag doesn't work".
func drag(from: CGPoint, to: CGPoint, steps: Int = 25) {
    move(from)
    usleep(50_000)
    post(.leftMouseDown, from)
    usleep(80_000)
    for step in 1...steps {
        let t = CGFloat(step) / CGFloat(steps)
        let point = CGPoint(
            x: from.x + (to.x - from.x) * t,
            y: from.y + (to.y - from.y) * t
        )
        post(.leftMouseDragged, point)
        usleep(15_000)
    }
    usleep(80_000)
    post(.leftMouseUp, to)
}

let args = CommandLine.arguments

func number(_ index: Int) -> CGFloat? {
    guard index < args.count, let value = Double(args[index]) else { return nil }
    return CGFloat(value)
}

func usage() -> Never {
    FileHandle.standardError.write(
        Data(
            "usage: mouse permissions | mouse move|click|dblclick <x> <y> | mouse drag <x1> <y1> <x2> <y2>\n"
                .utf8)
    )
    exit(2)
}

guard args.count >= 2 else { usage() }

switch args[1] {
case "permissions":
    // Ask before reporting: a first run on an ungranted machine should raise the dialog, not just
    // print that something is missing.
    if isTrusted(prompt: true) {
        print("accessibility: granted")
    } else {
        print("accessibility: NOT granted — approve the prompt, or add the app manually at")
        print("  System Settings -> Privacy & Security -> Accessibility")
        print("The row to enable is the app hosting this shell, not `mouse`.")
        // Approval takes effect immediately for new processes but not for this one, so exiting
        // non-zero keeps a scripted caller from treating an un-granted machine as ready.
        exit(3)
    }
case "move", "click", "dblclick":
    requireTrust()
    guard let x = number(2), let y = number(3) else { usage() }
    let point = CGPoint(x: x, y: y)
    move(point)
    usleep(50_000)
    if args[1] == "click" { click(point) }
    if args[1] == "dblclick" { doubleClick(point) }
case "drag":
    requireTrust()
    guard let x1 = number(2), let y1 = number(3), let x2 = number(4), let y2 = number(5)
    else { usage() }
    drag(from: CGPoint(x: x1, y: y1), to: CGPoint(x: x2, y: y2))
default:
    usage()
}
