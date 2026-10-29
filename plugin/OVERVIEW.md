# Paseobility

Paseobility brings twelve reusable workflows to Paseo, with a searchable skill picker and a screen for installed skills, versions and updates on the selected computer.

Open **Paseobility** above an existing conversation's input, search for a skill and select it to append its slash reference to your draft. Your text and attachments stay in place; you send the message yourself. On native mobile clients and new-agent drafts, use **+ → Attach Paseobility** to add a skill reference. The sidebar and Command Center open the version screen.

## Workflows

- **Design and task execution:** `paseo-design` starts from a brief, reviews the visual result and checks phone, tablet and desktop layouts. Explicit `paseo-god` requests start with a plan and TODO list, track verification evidence and preserve a resume or handoff point when work remains.
- **Browser and desktop work:** `paseo-browser` reuses an Ego Lite task space or a selected Chrome tab. `paseo-cua` operates native apps through the separately installed Cua Driver.
- **Projects and computers:** `paseo-project` prepares repository briefs or environments, `paseo-multi` operates configured computers, and `paseo-orchestration` coordinates agents when explicitly requested.
- **Research, sharing and checks:** `paseo-research` answers how, why and compatibility questions from code, history and official docs with a cited report. `paseo-share` shares files through a private Git repository, `paseo-spyware-check` inspects repository code without executing it, and `paseo-agent-cleanup` previews disposable sessions for archiving. `paseo-toss` wraps the official Apps-in-Toss Harness workflows.

## Setup and updates

The plugin supports Paseo **0.12.x and 0.13.x**. The interface is in English, or in Korean when the app language is Korean (on 0.12, the device language). Screenshots show the skill picker in the Paseo web app. Native mobile behavior has not been visually verified.

Installing the plugin and installing the skill files are separate steps; the repository README explains skill setup. An existing agent may need a new session to discover newly installed skills. Some workflows need their own tools or connections: design checks require Node.js 20+ and a Chromium-family browser, native app control requires Cua Driver and OS permissions, and multi-host operation requires configured hosts.

The version screen shows the plugin version, verified installed-skill version when available, latest official release and installed state of each skill. Older installations without a receipt show an unknown skill version. File presence does not prove that an agent has loaded a skill or has the required runtime permissions.

Choosing **Update** downloads a newer official release from `wilgon456/Paseobility` on GitHub, verifies its version and commit, backs up existing skills and updates a separate managed plugin source. Existing Claude skill installations are included. Git and the Paseo CLI must be available on the selected computer. Updates preserve the development checkout and do not restart Paseo or update browser/Cua runtimes. Progress and content hashes are stored under `~/.paseobility/updates/`, and backups under `~/.agents/skills-backups/`. An interrupted or uncertain update may require inspection before retrying.

## Data and permissions

Version checks contact GitHub's public release API; updates fetch the official repository and run the local Paseo plugin installer. The plugin does not send draft text or attachments to GitHub and adds no telemetry. When you send a message, Paseo passes the selected skill reference and your message or attachments through its normal agent-provider flow. Individual workflows may access the websites, computers or private Git repository needed for the task you request.
