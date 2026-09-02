/**
 * Quotes shown one-at-a-time on the About tab.
 *
 * Attributions are deliberately conservative: several of the most-shared programming quotes
 * ("computer science is no more about computers than astronomy is about telescopes", the
 * "90-90 rule" in its usual form) circulate with the wrong name attached, so anything whose
 * source could not be pinned to a specific person is left out rather than guessed at.
 */

export type Quote = {
  text: string
  author: string
}

export const QUOTES: readonly Quote[] = [
  {
    text: 'Simplicity is prerequisite for reliability.',
    author: 'Edsger W. Dijkstra',
  },
  {
    text: 'If debugging is the process of removing software bugs, then programming must be the process of putting them in.',
    author: 'Edsger W. Dijkstra',
  },
  {
    text: 'The best way to predict the future is to invent it.',
    author: 'Alan Kay',
  },
  {
    text: 'Simple things should be simple, complex things should be possible.',
    author: 'Alan Kay',
  },
  {
    text: 'Premature optimization is the root of all evil.',
    author: 'Donald Knuth',
  },
  {
    text: 'Beware of bugs in the above code; I have only proved it correct, not tried it.',
    author: 'Donald Knuth',
  },
  {
    text: "The most damaging phrase in the language is: 'We've always done it this way.'",
    author: 'Grace Hopper',
  },
  {
    text: 'A ship in port is safe, but that is not what ships are built for.',
    author: 'Grace Hopper',
  },
  {
    text: 'There are two ways of constructing a software design: one way is to make it so simple that there are obviously no deficiencies, and the other way is to make it so complicated that there are no obvious deficiencies.',
    author: 'C. A. R. Hoare',
  },
  {
    text: 'Adding manpower to a late software project makes it later.',
    author: 'Fred Brooks',
  },
  {
    text: 'The bearing of a child takes nine months, no matter how many women are assigned.',
    author: 'Fred Brooks',
  },
  {
    text: 'Talk is cheap. Show me the code.',
    author: 'Linus Torvalds',
  },
  {
    text: 'One of my most productive days was throwing away 1000 lines of code.',
    author: 'Ken Thompson',
  },
  {
    text: "Data dominates. If you've chosen the right data structures and organized things well, the algorithms will almost always be self-evident.",
    author: 'Rob Pike',
  },
  {
    text: 'Measure. Do not tune for speed until you have measured, and even then do not unless one part of the code overwhelms the rest.',
    author: 'Rob Pike',
  },
  {
    text: 'All problems in computer science can be solved by another level of indirection.',
    author: 'David Wheeler',
  },
  {
    text: "A language that doesn't affect the way you think about programming is not worth knowing.",
    author: 'Alan Perlis',
  },
  {
    text: 'Simplicity does not precede complexity, but follows it.',
    author: 'Alan Perlis',
  },
  {
    text: 'A distributed system is one in which the failure of a computer you did not even know existed can render your own computer unusable.',
    author: 'Leslie Lamport',
  },
  {
    text: 'There are only two kinds of languages: the ones people complain about and the ones nobody uses.',
    author: 'Bjarne Stroustrup',
  },
  {
    text: 'C makes it easy to shoot yourself in the foot; C++ makes it harder, but when you do, it blows your whole leg off.',
    author: 'Bjarne Stroustrup',
  },
  {
    text: 'Any fool can write code that a computer can understand. Good programmers write code that humans can understand.',
    author: 'Martin Fowler',
  },
  {
    text: 'UNIX is very simple, it just needs a genius to understand its simplicity.',
    author: 'Dennis Ritchie',
  },
  {
    text: 'Debugging is twice as hard as writing the code in the first place. Therefore, if you write the code as cleverly as possible, you are — by definition — not smart enough to debug it.',
    author: 'Brian Kernighan',
  },
  {
    text: 'Controlling complexity is the essence of computer programming.',
    author: 'Brian Kernighan',
  },
  {
    text: 'The Analytical Engine weaves algebraical patterns just as the Jacquard loom weaves flowers and leaves.',
    author: 'Ada Lovelace',
  },
  {
    text: 'We can only see a short distance ahead, but we can see plenty there that needs to be done.',
    author: 'Alan Turing',
  },
  {
    text: 'Algorithms + Data Structures = Programs.',
    author: 'Niklaus Wirth',
  },
  {
    text: 'Modularity based on abstraction is the way things get done.',
    author: 'Barbara Liskov',
  },
  {
    text: 'Focus is a matter of deciding what things you are not going to do.',
    author: 'John Carmack',
  },
]

/** A random quote. Callers pass their own index when they want to advance deterministically. */
export function randomQuote(previous?: Quote): Quote {
  if (QUOTES.length === 0) throw new Error('QUOTES is empty')
  // Re-roll once so pressing "shuffle" never appears to do nothing. One retry is enough:
  // the odds of two consecutive collisions are 1/900, and a bounded loop cannot hang.
  const pick = () => QUOTES[Math.floor(Math.random() * QUOTES.length)] as Quote
  const first = pick()
  if (previous && first.text === previous.text) return pick()
  return first
}
