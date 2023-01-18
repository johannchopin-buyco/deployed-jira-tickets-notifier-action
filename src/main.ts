import * as core from '@actions/core'
import * as exec from '@actions/exec'

import GITHUB_TO_SLACK_MAPPING from './github-to-slack-mapping.json'

const COMMITS_DATA_SEPARATOR = ' || '
const JIRA_TICKET_LINK_MATCHER = /https:\/\/buycoteam.atlassian.net\/browse\/.*/

export interface Commit {
  author: string
  message: string
  jiraTicket?: string
}

const renderPrettyMessage = (commits: Commit[]): string => {
  const prettyCommitList: string[] = []

  commits.forEach(({author, jiraTicket, message}) => {
    const matchingSlackUser = (GITHUB_TO_SLACK_MAPPING as any)[author]
    author = matchingSlackUser ? `<@${matchingSlackUser}>` : author
    let prettyCommit = `-  ${message}`

    if (jiraTicket) prettyCommit += `\\n   ${jiraTicket} by ${author}`

    prettyCommitList.push(prettyCommit)
  })

  return `Huraa! A new Frontend release has been deployed:\\n\\n${prettyCommitList.join(
    '\\n'
  )}`
}

const getExecResult = async (command: string): Promise<string> => {
  let result = ''

  await exec.exec(command, [], {
    listeners: {
      stdout: data => {
        result = data.toString().trim()
      },
      stderr: data => {
        throw new Error(data.toString())
      }
    }
  })

  return result
}

// a commit string is smtgh like "johannchopin-buyco || fix(foobar): and another one || Jira Link: https://buycoteam.atlassian.net/browse/MIS-42"
const parseCommitString = (commit: string): Commit => {
  const [author, message, description] = commit.split(COMMITS_DATA_SEPARATOR)

  let jiraTicket: string | undefined
  if (description) {
    jiraTicket = description.match(JIRA_TICKET_LINK_MATCHER)?.[0] || undefined
  }

  return {
    author,
    message,
    jiraTicket
  }
}

const getCommitsFromOutput = (output: string): Commit[] => {
  const lines = output.split(/\r?\n/).filter(line => line.length > 0)

  return lines.map(line => parseCommitString(line))
}

async function run(): Promise<void> {
  try {
    const lastTagVersion = await getExecResult(
      'git describe --tags --abbrev=0 HEAD^'
    )
    const GET_DEPLOYED_COMMITS_DATA = `git log ${lastTagVersion}..HEAD --pretty=format:"%an${COMMITS_DATA_SEPARATOR}%s${COMMITS_DATA_SEPARATOR}%b" --`

    const commits = getCommitsFromOutput(
      await getExecResult(GET_DEPLOYED_COMMITS_DATA)
    )
    console.log('===')
    console.log(renderPrettyMessage(commits))
    console.log('===')

    core.setOutput('message', renderPrettyMessage(commits))
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
