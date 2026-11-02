// The CI pipeline for Jenkins (CI-02, CI-04), the same steps as .github/workflows/ci.yml on one
// agent: gates, the suite in shards one after another, the lanes, then the merged report, the
// quality gate and the test-management report. Every step calls an npm script of package.json, apart
// from the probes of the Node stage; scripts/__tests__/ci-files.test.mjs checks it. What an agent
// needs and how the job is set up: docs/guides/jenkins.md.
//
// One QA_RUN_ID covers the whole build. The build has its own compose project, so it never touches
// a Juice Shop started by hand on the same Docker engine; both publish port 3000, so only one of
// them runs at a time.

import groovy.transform.Field

/** A step with `sh` on a Linux agent and `bat` on a Windows one. */
def shell(Map options = [:], String command) {
  if (isUnix()) {
    return sh(options + [script: command])
  }
  // `@` keeps the command itself out of the output, so returnStdout returns only what it prints.
  return bat(options + [script: "@${command}"])
}

/** A build the weekly timer started, or one asked for with FLAKE_LANE, runs only the flake lane. */
def flakeBuild() {
  return params.FLAKE_LANE ||
    !currentBuild.getBuildCauses('hudson.triggers.TimerTrigger$TimerTriggerCause').isEmpty()
}

/** The JUnit file of one Playwright step: each step writes its own, the post step publishes all. */
def junitOf(String step) {
  return "QA_JUNIT_REPORT=reports/junit-${step}.xml"
}

/**
 * The Playwright options of a run: the projects, and the workers when WORKERS sets them. A lane
 * that fixes its own workers (the destructive one) takes the projects only, or it refuses to run.
 */
def playwrightOptions(boolean withWorkers = true) {
  String workers = withWorkers ? params.WORKERS?.trim() : ''
  return '--project="juice-shop-*"' + (workers ? " --workers=${workers}" : '')
}

// Set once Juice Shop has been started; the post steps stop it only then.
@Field boolean juiceShopStarted = false

pipeline {
  // Parameters exist only after the first build has read this file; until then the label is empty.
  agent { label params.AGENT_LABEL ?: '' }

  parameters {
    string(name: 'AGENT_LABEL', defaultValue: '', description: 'Label of the agent that runs the build; empty means any agent.')
    string(name: 'SHARDS', defaultValue: '4', description: 'How many shards the suite is split into; they run one after another.')
    string(name: 'WORKERS', defaultValue: '', description: 'Playwright workers of each run; empty means the Playwright default. Fewer suit an agent whose browsers are slow.')
    booleanParam(name: 'BROWSER_DEPS', defaultValue: false, description: 'Also install the system packages the browsers need. It needs administrator rights on the agent; once per agent is enough.')
    booleanParam(name: 'FLAKE_LANE', defaultValue: false, description: 'Run only the flake lane.')
  }

  triggers {
    cron('H 6 * * 1') // weekly: the flake lane (see flakeBuild)
  }

  options {
    timestamps()
    timeout(time: 120, unit: 'MINUTES')
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  environment {
    CI = '1'
    QA_ENV = 'ci'
    // jenkins-<job>-<build number>: traceable to this build.
    QA_RUN_ID = "${env.BUILD_TAG}"
    COMPOSE_PROJECT_NAME = 'qa-jenkins'
  }

  stages {
    stage('Node') {
      steps {
        script {
          String wanted = readFile('.nvmrc').trim()
          String actual = shell(returnStdout: true, 'node -p "process.versions.node.split(\'.\')[0]"').trim()
          if (actual != wanted) {
            error("The agent has Node ${actual}; .nvmrc asks for ${wanted}.")
          }
          // npm must run its scripts with this Node, on this platform. On a Linux agent in WSL the
          // Windows PATH follows the Linux one, and a Windows npm found there runs every `npm run`
          // through cmd.exe, which refuses the workspace's path.
          String platform = shell(returnStdout: true, 'node -p "process.platform"').trim()
          String viaNpm = shell(returnStdout: true, 'npm exec -c "node -p process.platform"').trim()
          if (viaNpm != platform) {
            error("npm does not run its scripts with the agent's Node (${platform}); it printed: " +
              "${viaNpm.take(300)}. Put that Node's npm first on the agent's PATH " +
              '(docs/guides/jenkins.md, "A Linux agent in WSL").')
          }
        }
        // The workspace outlives a build: nothing of the last one reaches this build's report.
        dir('reports') { deleteDir() }
        dir('blob-report') { deleteDir() }
        dir('allure-results') { deleteDir() }
        dir('playwright-report') { deleteDir() }
        dir('test-results') { deleteDir() }
      }
    }

    stage('Install') {
      steps {
        shell 'npm ci'
        script {
          if (params.BROWSER_DEPS) {
            shell 'npm run ci:browsers'
          } else {
            shell 'npm run ci:browsers:no-deps'
          }
        }
      }
    }

    stage('Gates') {
      when { expression { !flakeBuild() } }
      steps {
        shell 'npm run gates'
      }
    }

    stage('Suite') {
      when { expression { !flakeBuild() } }
      steps {
        script {
          juiceShopStarted = true
          shell 'npm run juice-shop:up'
          int total = params.SHARDS as int
          for (int shard = 1; shard <= total; shard++) {
            // Each shard adds its blob (report-<shard>.zip) next to the earlier ones instead of
            // emptying the folder. A failing shard marks the build failed; the next ones still run.
            withEnv(['QA_BLOB_REPORT=1', 'PWTEST_BLOB_DO_NOT_REMOVE=1', junitOf("suite-${shard}")]) {
              catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
                shell "npm test -- ${playwrightOptions()} --shard=${shard}/${total}"
              }
            }
          }
        }
      }
    }

    stage('Lanes') {
      when { expression { !flakeBuild() } }
      steps {
        // One Juice Shop for the three lanes, so the destructive one, which restarts it, goes last.
        // A failing lane marks the build failed; the next lanes and the report still run.
        withEnv([junitOf('a11y')]) {
          catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
            shell "npm run lanes:a11y -- ${playwrightOptions()}"
          }
        }
        // The pinned container reaches Juice Shop on the compose network: the host publishes the
        // port on its loopback only, out of a container's reach.
        withEnv([junitOf('visual'), 'QA_JUICE_SHOP_BASE_URL=http://juice-shop:3000']) {
          catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
            shell "npm run lanes:visual -- ${playwrightOptions()}"
          }
        }
        withEnv([junitOf('destructive')]) {
          catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
            shell "npm run lanes:destructive -- ${playwrightOptions(false)}"
          }
        }
      }
    }

    stage('Report') {
      when { expression { !flakeBuild() } }
      steps {
        shell 'npm run ci:merge'
        shell 'npm run quality:gate -- --report reports/playwright.json --report reports/lanes/a11y.json --report reports/lanes/visual.json --report reports/lanes/destructive.json'
      }
      post {
        always {
          script {
            if (fileExists('reports/quality-gate.md')) {
              echo readFile('reports/quality-gate.md')
            }
          }
          shell 'npm run tm:report'
        }
      }
    }

    stage('Flake lane') {
      when { expression { flakeBuild() } }
      steps {
        script {
          juiceShopStarted = true
        }
        shell 'npm run juice-shop:up'
        withEnv([junitOf('flake')]) {
          shell "npm run lanes:flake -- ${playwrightOptions()}"
        }
      }
    }
  }

  post {
    always {
      junit(testResults: 'reports/junit-*.xml', allowEmptyResults: true)
      archiveArtifacts(artifacts: 'playwright-report/**, reports/**, test-results/**', allowEmptyArchive: true)
    }
    cleanup {
      script {
        if (juiceShopStarted) {
          shell(returnStatus: true, 'npm run juice-shop:down')
        }
      }
    }
  }
}
