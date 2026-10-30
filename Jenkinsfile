// The CI pipeline for Jenkins (CI-02), the same stages as .github/workflows/ci.yml. Every `sh`
// calls an npm script of package.json; scripts/__tests__/ci-files.test.mjs checks it. Agents
// labelled `qa` need Node 22, Docker with Compose, and gitleaks on the PATH for the secret scan.
// Each shard runs on an agent of its own with its own Juice Shop; the lanes and the report run on
// the first agent. One QA_RUN_ID covers the whole build.

// A build the weekly timer started, or one asked for with FLAKE_LANE, runs only the flake lane.
def flakeBuild() {
  return params.FLAKE_LANE ||
    !currentBuild.getBuildCauses('hudson.triggers.TimerTrigger$TimerTriggerCause').isEmpty()
}

def shardStage(int shard, int total) {
  return {
    node('qa') {
      checkout scm
      try {
        sh 'npm ci'
        sh 'npm run ci:browsers'
        sh 'npm run juice-shop:up'
        // A failing shard marks the build failed but still hands its results to the report.
        catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
          withEnv(['QA_BLOB_REPORT=1']) {
            sh "npm test -- --project='juice-shop-*' --shard=${shard}/${total}"
          }
        }
      } finally {
        stash name: "suite-${shard}", includes: 'blob-report/**,allure-results/**', allowEmpty: true
        sh 'npm run juice-shop:down'
      }
    }
  }
}

pipeline {
  agent { label 'qa' }

  parameters {
    string(name: 'SHARDS', defaultValue: '4', description: 'How many shards the suite is split into')
    booleanParam(name: 'FLAKE_LANE', defaultValue: false, description: 'Run only the flake lane')
  }

  triggers {
    cron('H 6 * * 1') // weekly: the flake lane (see flakeBuild)
  }

  options {
    timestamps()
    timeout(time: 90, unit: 'MINUTES')
  }

  environment {
    CI = '1'
    QA_ENV = 'ci'
    QA_RUN_ID = "jenkins-${env.BUILD_TAG}"
  }

  stages {
    stage('Gates') {
      when { expression { !flakeBuild() } }
      steps {
        sh 'npm ci'
        sh 'npm run ci:browsers'
        sh 'npm run gates'
      }
    }

    stage('Suite') {
      when { expression { !flakeBuild() } }
      steps {
        script {
          int total = params.SHARDS as int
          def shards = [:]
          for (int shard = 1; shard <= total; shard++) {
            shards["shard ${shard}/${total}"] = shardStage(shard, total)
          }
          parallel shards
        }
      }
    }

    stage('Lanes') {
      when { expression { !flakeBuild() } }
      steps {
        sh 'npm run juice-shop:up'
        // One Juice Shop for the three lanes, so the destructive one, which restarts it, goes last.
        // A failing lane marks the build failed; the next lanes and the report still run.
        catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
          sh "npm run lanes:a11y -- --project='juice-shop-*'"
        }
        catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
          sh "npm run lanes:visual -- --project='juice-shop-*'"
        }
        catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
          sh "npm run lanes:destructive -- --project='juice-shop-*'"
        }
      }
    }

    stage('Report') {
      when { expression { !flakeBuild() } }
      steps {
        script {
          for (int shard = 1; shard <= (params.SHARDS as int); shard++) {
            unstash "suite-${shard}"
          }
        }
        sh 'npm run ci:merge'
        sh 'npm run quality:gate -- --report reports/playwright.json --report reports/lanes/a11y.json --report reports/lanes/visual.json --report reports/lanes/destructive.json'
      }
      post {
        always {
          sh 'npm run tm:report'
        }
      }
    }

    stage('Flake lane') {
      when { expression { flakeBuild() } }
      steps {
        sh 'npm ci'
        sh 'npm run ci:browsers'
        sh 'npm run juice-shop:up'
        sh "npm run lanes:flake -- --project='juice-shop-*'"
      }
    }
  }

  post {
    always {
      archiveArtifacts artifacts: 'playwright-report/**,reports/**,test-results/**', allowEmptyArchive: true
      sh 'npm run juice-shop:down'
    }
  }
}
