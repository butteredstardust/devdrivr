// Synthetic mouse driver for native-UI debugging of the Tauri window.
//
// Build:  swiftc -O -o /tmp/mouse apps/cockpit/scripts/native-ui/mouse.swift
// Usage:  /tmp/mouse move     <x> <y>
//         /tmp/mouse click    <x> <y>
//         /tmp/mouse dblclick <x> <y>
//         /tmp/mouse drag     <x1> <y1> <x2> <y2>
//
// Coordinates are global screen points with the origin at the TOP-LEFT (same space AppleScript's
// `position` returns), not AppKit's bottom-left space.
//
// Requires Accessibility permission for the terminal/agent posting the events
// (System Settings -> Privacy & Security -> Accessibility). Without it the events are silently
// dropped and every test looks like "the app ignores clicks".
//
// Why a compiled helper rather than `cliclick` or AppleScript `click at`: this sets
// `.mouseEventClickState` explicitly, which is what makes `e.detail === 2` arrive in the DOM.
// Tauri's injected drag script (tauri-2.x/src/window/scripts/drag.js) keys macOS zoom-on-double-
// click off exactly that value, so a helper that leaves clickState at 1 can never reproduce it.

import CoreGraphics
import Foundation

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
        Data("usage: mouse move|click|dblclick <x> <y> | mouse drag <x1> <y1> <x2> <y2>\n".utf8)
    )
    exit(2)
}

guard args.count >= 2 else { usage() }

switch args[1] {
case "move", "click", "dblclick":
    guard let x = number(2), let y = number(3) else { usage() }
    let point = CGPoint(x: x, y: y)
    move(point)
    usleep(50_000)
    if args[1] == "click" { click(point) }
    if args[1] == "dblclick" { doubleClick(point) }
case "drag":
    guard let x1 = number(2), let y1 = number(3), let x2 = number(4), let y2 = number(5)
    else { usage() }
    drag(from: CGPoint(x: x1, y: y1), to: CGPoint(x: x2, y: y2))
default:
    usage()
}
