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
              用明确的契约，构建可演进的 Go 应用
            </Translate>
          </h1>
          <p className={styles.lead}>
            <Translate id="homepage.description">
              Vine
              统一应用生命周期、依赖注入、服务调用、事件、任务与部署，让业务代码保持清晰。
            </Translate>
          </p>
          <div className={styles.actions}>
            <Link className={styles.primaryAction} to="/docs/getting-started">
              <Translate id="homepage.start">开始使用 Vine</Translate>
            </Link>
            <Link
              className={styles.secondaryAction}
              href="https://skel.yorun.ai">
              <Translate id="homepage.otherSite">了解 Skel</Translate>
            </Link>
          </div>
        </section>

        <section className={styles.flow} aria-label="Vine framework overview">
          <article>
            <span>01</span>
            <h2>Application</h2>
            <p>
              <Translate id="homepage.flow.application">
                用 App、Module 和组件组织依赖、生命周期与业务边界。
              </Translate>
            </p>
          </article>
          <article>
            <span>02</span>
            <h2>Capabilities</h2>
            <p>
              <Translate id="homepage.flow.capabilities">
                以一致的方式使用 Rpc、Web、Event、Task、Redis 和数据库。
              </Translate>
            </p>
          </article>
          <article>
            <span>03</span>
            <h2>Runtime</h2>
            <p>
              <Translate id="homepage.flow.runtime">
                从单进程开发平滑演进到由 Hub、Link 和 Portal 组成的部署。
              </Translate>
            </p>
          </article>
        </section>
      </main>
    </Layout>
  )
}
