# Jenkins

The [`Jenkinsfile`](../../Jenkinsfile) runs the steps of the GitHub workflow
([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)) as one declarative pipeline on one
agent, Windows or Linux. Every step calls an npm script, so a build does what a person runs on their
machine ([running tests](running-tests.md)).

| Stage | What it runs |
|---|---|
| Node | checks the agent's Node against `.nvmrc`, and that npm runs its scripts with that Node; empties `reports/` and the other result folders the last build left |
| Install | `npm ci`, then the browsers: `npm run ci:browsers:no-deps`, or `npm run ci:browsers` with `BROWSER_DEPS` |
| Gates | `npm run gates` |
| Suite | Juice Shop, then the suite in `SHARDS` shards, one after another, each adding its blob report |
| Lanes | the accessibility, visual and destructive lanes, the destructive one last, since it restarts Juice Shop |
| Report | `npm run ci:merge`, the quality gate over the suite and the lanes, then `npm run tm:report` |
| Flake lane | instead of the stages above, in a build the weekly timer starts or one with `FLAKE_LANE` |

A failing shard or lane marks the build failed and the next steps still run, so the report covers
the whole build; a failure in the gates stops it. One `QA_RUN_ID`, Jenkins' `BUILD_TAG`
(`jenkins-<job>-<build number>`), covers the build. The quality gate's summary is printed in the
log; the post steps publish the JUnit reports (`reports/junit-*.xml`, one per Playwright step),
archive `playwright-report/`, `reports/` and `test-results/`, and stop Juice Shop.

## The agent

- **git, and Node at the major version in [`.nvmrc`](../../.nvmrc), with its own npm first on the
  `PATH`.** The Node stage stops a build whose npm runs its scripts with another Node or on another
  platform.
- **Docker with the compose plugin.** The build starts Juice Shop in a compose project of its own,
  `qa-jenkins`, so it never stops or restarts a Juice Shop started by hand. Both publish port 3000:
  stop yours (`npm run juice-shop:down`) while a build runs.
- **gitleaks on the `PATH`**, for the secret scan of the gates. Without it the gates fail and say so.
- **The system packages the browsers need.** Installing them needs administrator rights, once per
  agent: `npx playwright install-deps chromium firefox webkit` as an administrator, or one build with
  `BROWSER_DEPS` on an agent whose user may install packages. The browsers themselves are installed
  by every build into the user's cache, which needs no rights.
- **One build at a time per Docker engine.** Agents that share an engine share the `qa-jenkins`
  project and port 3000. `disableConcurrentBuilds` keeps the job from overlapping itself; keep other
  jobs that use the same engine from running beside it.

Plugins: Pipeline, Git, Credentials, JUnit and Timestamper.

## The job

A Pipeline job with **Pipeline script from SCM**: the repository URL, the branch, and script path
`Jenkinsfile`. A private repository is read through a credential: a fine-grained GitHub token limited
to the repository with **Contents: Read-only**, stored in Jenkins as **Username with password** (the
GitHub user and the token) and selected in the job's repository settings. Jenkins keeps the token;
neither the pipeline nor its log ever shows it.

Parameters appear after the first build has read the file; until then each takes its default.

| Parameter | Use |
|---|---|
| `AGENT_LABEL` | the label of the agent that runs the build; empty means any agent |
| `SHARDS` | how many shards the suite is split into, 4 by default as in the GitHub workflow |
| `WORKERS` | Playwright workers of every run but the destructive lane, which keeps its one worker; empty keeps Playwright's default, half the agent's CPUs. Fewer suit an agent whose browsers are slow: cases that time out under load are the agent's limit, not the product's |
| `BROWSER_DEPS` | also install the browsers' system packages; needs administrator rights on the agent |
| `FLAKE_LANE` | run only the flake lane |

The pipeline declares its weekly timer for the flake lane (`cron('H 6 * * 1')`), so Jenkins adds it
to the job after the first build.

## A Linux agent in WSL

A WSL distribution with Docker Desktop's integration can host a Linux agent next to a Windows one on
the same machine:

- **Its remote root on the distribution's own filesystem**, such as `/home/<user>/jenkins-agent`,
  not under `/mnt/c`.
- **A `PATH` of Linux directories only, with the agent's own Node and gitleaks on it.** WSL appends
  the Windows `PATH` to the Linux one; a distribution without its own npm then finds the Windows npm
  there, which runs every `npm run` through `cmd.exe`, and the Node stage stops the build. Unpacking a
  Node release and the gitleaks binary under the agent's folder, and starting the agent from a script
  that puts that folder first on the `PATH`, needs no administrator rights.
- **The browsers' system packages, once, with `sudo`**, using the agent's Node:
  `sudo env PATH="$HOME/jenkins-agent/node/bin:$PATH" npx -y playwright@<version> install-deps chromium firefox webkit`,
  with the Playwright version of `package.json`.
- **Nothing else changes.** The containers run on Docker Desktop's engine, so `localhost` reaches the
  port compose publishes and the visual lane's bind mount works from the agent's workspace. The
  lane's image runs as root and a Linux mount keeps owners, so the lane gives what it wrote back to
  the workspace's owner before it ends; the steps after it can overwrite its reports.
- **Builds on it only when asked.** Give the node the usage "Only build jobs with label expressions
  matching this node", so builds without `AGENT_LABEL` go to the other agent, and start a build on it
  with `AGENT_LABEL=<its label>` when no other build uses the engine.
