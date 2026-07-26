import React, {type ReactNode} from 'react'
import Link from '@docusaurus/Link'
import Layout from '@theme/Layout'
import Translate from '@docusaurus/Translate'

import styles from './index.module.css'

export default function Home(): ReactNode {
  return (
    <Layout
      title="Vine"
      description="Build Go applications with explicit contracts and composable runtime capabilities.">
      <main className={styles.main}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>Vine</p>
          <h1>
            <Translate id="homepage.title">
              Build evolvable Go applications with explicit contracts
            </Translate>
          </h1>
          <p className={styles.lead}>
            <Translate id="homepage.description">
              Vine brings together application lifecycle, dependency injection,
              service calls, events, tasks, and deployment while keeping
              business code clear.
            </Translate>
          </p>
          <div className={styles.actions}>
            <Link className={styles.primaryAction} to="/docs/getting-started">
              <Translate id="homepage.start">Get started with Vine</Translate>
            </Link>
            <Link
              className={styles.secondaryAction}
              href="https://skel.yorun.ai">
              <Translate id="homepage.otherSite">Explore Skel</Translate>
            </Link>
          </div>
        </section>

        <section className={styles.flow} aria-label="Vine framework overview">
          <article>
            <span>01</span>
            <h2>Application</h2>
            <p>
              <Translate id="homepage.flow.application">
                Organize dependencies, lifecycle, and business boundaries with
                apps, modules, and components.
              </Translate>
            </p>
          </article>
          <article>
            <span>02</span>
            <h2>Capabilities</h2>
            <p>
              <Translate id="homepage.flow.capabilities">
                Use Rpc, Web, Event, Task, Redis, and databases through
                consistent framework conventions.
              </Translate>
            </p>
          </article>
          <article>
            <span>03</span>
            <h2>Runtime</h2>
            <p>
              <Translate id="homepage.flow.runtime">
                Evolve from single-process development to deployments composed
                of Hub, Link, and Portal.
              </Translate>
            </p>
          </article>
        </section>
      </main>
    </Layout>
  )
}
