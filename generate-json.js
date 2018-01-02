/**
 * @flow
 */

/*::
type Date = [number, number, number]
type Time = { hour: number, minute: number }
type Agenda = {
  from: Time,
  to: Time,
  after: boolean,
  agenda: string
}
type Link = {
  title: string,
  url: string,
  type: 'website' | 'ticket' | 'rsvp',
  price?: string,
}
type Event = {
  start: Date,
  end: Date,
  categories: Array<string>,
  topics: Array<string>,
  time: Array<Agenda>,
  title: string,
  location: {
    title: string,
    detail: ?string
  },
  summary: string,
  description: string,
  links: Array<Link>
}

type Section = {
  title: ?string,
  startLine: number,
  text: string
}
*/
const peg = require('pegjs')
const fs = require('fs')

const grammar = fs.readFileSync('./grammar.pegjs', { encoding: 'utf8' })
const parser = peg.generate(grammar)

class ParseError extends Error {
  /*::
  expected: any
  found: any
  location: any
  */
  constructor(syntaxError) {
    const location = syntaxError.location
    const message =
      `Parse error at line ${location.start.line}` +
      ` column ${location.start.column}.` +
      ` ${syntaxError.message}`
    super(message)

    this.expected = syntaxError.expected
    this.found = syntaxError.found
    this.location = syntaxError.location
  }
}

function splitSections(text) /*:Array<Section>*/ {
  const lines = text.split(/\r\n|\r|\n/)
  const sections /*:Array<Section>*/ = []
  let currentSection
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.match(/^\s*##[^#]/)) {
      currentSection = {
        title: line.substr(2).trim(),
        startLine: i + 1,
        text: line
      }
      sections.push(currentSection)
    } else if (!currentSection) {
      currentSection = {
        title: null,
        startLine: i + 1,
        text: line
      }
      sections.push(currentSection)
    } else {
      currentSection.text += '\n' + line
    }
  }
  return sections
}

const rawContent = fs.readFileSync('./README.md', { encoding: 'utf8' })

const sectionByMonth = splitSections(rawContent)
  .filter(section => /\w+\s*\d+/.test(section.title || ''))
  .map(section => {
    try {
      return parser.parse(section.text)
    } catch (error) {
      throw new ParseError(error)
    }
  })

function generateJSON(document): Array<Event> {
  return document.events.map(event => {
    const header = event.header
    const content = event.content

    const year = parseInt(document.year, 10)
    const month = document.month

    let start = { year, month, date: +header.day.from }
    let end = undefined
    if (header.day.to) {
      end = { year, month, date: +header.day.to }
    }
    return {
      start,
      end,
      categories: content.topic.categories,
      topics: content.topic.topics,
      time: content.time,
      title: header.title,
      location: content.location,
      summary: content.summary,
      description: content.description,
      links: [
        ...findLinks(content.website, 'website'),
        ...findLinks(content.ticket, 'ticket'),
        ...findLinks(content.rsvp, 'rsvp')
      ]
    }
  })
}

function findLinks(linkTable, type) {
  return (linkTable || []).map(link => {
    const result = Object.assign({}, link, link.link, { type })
    delete result.link
    return result
  })
}

const jsonByMonth = sectionByMonth.map(document => {
  return generateJSON(document)
})

const json = jsonByMonth.reduce((a, b) => [...a, b])

console.log(JSON.stringify(json, null, 2))
