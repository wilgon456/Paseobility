# Paseobility

Paseobility brings fifteen reusable workflows to Paseo, with a searchable skill picker and a screen for installed skills, versions and updates on the selected computer.

Open **Paseobility** above an existing conversation's input, search for a skill and select it to append its slash reference to your draft. Your text and attachments stay in place; you send the message yourself. On native mobile clients and new-agent drafts, use **+ → Attach Paseobility** to add a skill reference. The sidebar and Command Center open the version screen.

## Workflows

- **On-demand local skills:** explicit `/ps <task>` lists local skills across agent homes, chooses a fitting specialist and reads its original instructions without installing or copying it. `/ps list` shows the catalog. The plugin picker lists the fifteen bundled entry points; it does not expand into the local catalog.
- **Planning and writing:** explicit `ps-plan` requests produce one grounded Markdown plan with testable criteria. Explicit `ps-write` requests draft reader-facing documents, trace facts to sources and review clarity; Korean style guidance loads only for Korean output. Both check for a local specialist once and retain their own verification.
- **Design and task execution:** `ps-design` starts from a brief, reviews the visual result and checks phone, tablet and desktop layouts. Explicit `ps-god` requests start with a plan and TODO list, track verification evidence and preserve a resume or handoff point when work remains.
- **Browser and desktop work:** `ps-browser` reuses an Ego Lite task space or a selected Chrome tab. `ps-cua` operates native apps through the separately installed Cua Driver.
- **Projects and computers:** `ps-project` prepares repository briefs or environments, `ps-multi` operates configured computers, and `ps-orchestration` coordinates agents when explicitly requested.
- **Research, sharing and checks:** `ps-research` answers how, why and compatibility questions from code, history and official docs with a cited report. `ps-share` shares files through a private Git repository, `ps-spyware-check` inspects repository code without executing it, and `ps-agent-cleanup` previews disposable sessions for archiving. `ps-toss` wraps the official Apps-in-Toss Harness workflows.

## Setup and updates

The plugin supports Paseo **0.12.x through 0.15.x**, plus explicitly checked prereleases. The [plugin manifest](paseo-plugin.json) declares the current range; the [compatibility policy](../config/paseo-compatibility.json) lists verified versions. [Release monitoring](../docs/paseo-release-automation.md) proposes range updates only after its automated checks pass. The interface is in English, or in Korean when the app language is Korean (on 0.12, the device language). Screenshots show the skill picker in the Paseo web app. Native mobile behavior has not been visually verified.

Installing the plugin and installing the skill files are separate steps; the repository README explains skill setup. An existing agent may need a new session to discover newly installed skills. Some workflows need their own tools or connections: design checks require Node.js 20+ and a Chromium-family browser, native app control requires Cua Driver and OS permissions, and multi-host operation requires configured hosts.

The version screen shows the plugin version, verified installed-skill version when available, latest official release and installed state of each skill. Older installations without a receipt show an unknown skill version. File presence does not prove that an agent has loaded a skill or has the required runtime permissions.

Choosing **Update** downloads a newer official release from `wilgon456/Paseobility` on GitHub, verifies its version and commit, backs up existing skills and updates a separate managed plugin source. Existing Claude skill installations are included. Git and the Paseo CLI must be available on the selected computer. Updates preserve the development checkout and do not restart Paseo or update browser/Cua runtimes. Progress and content hashes are stored under `~/.paseobility/updates/`, and backups under `~/.agents/skills-backups/`. An interrupted or uncertain update may require inspection before retrying.

## Data and permissions

Version checks contact GitHub's public release API; updates fetch the official repository and run the local Paseo plugin installer. The plugin does not send draft text or attachments to GitHub and adds no telemetry. When you send a message, Paseo passes the selected skill reference and your message or attachments through its normal agent-provider flow. Individual workflows may access the websites, computers or private Git repository needed for the task you request.
