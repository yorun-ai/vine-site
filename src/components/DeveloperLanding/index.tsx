import React from 'react'
import Link from '@docusaurus/Link'
import Translate, {translate} from '@docusaurus/Translate'
import useBaseUrl from '@docusaurus/useBaseUrl'
import {useDocsVersion} from '@docusaurus/plugin-content-docs/client'
import {ArrowUpRight} from 'lucide-react'
import {
  governanceStages,
  guideGroups,
  vineMechanisms,
  type DocLink,
  type GuideLink as GuideLinkData,
} from '../../data/developerLanding'
import styles from './styles.module.css'

function useDocsPath(): (path: string) => string {
  const {isLast, version} = useDocsVersion()
  const docsBase = isLast
    ? '/docs'
    : version === 'current'
      ? '/docs/next'
      : `/docs/${version}`

  return (path: string) => `${docsBase}${path}`
}

function InlineDocLink({
  docsPath,
  link,
}: {
  docsPath: (path: string) => string
  link: DocLink
}) {
  return (
    <Link to={useBaseUrl(docsPath(link.to))}>
      <Translate id={link.title.id}>{link.title.text}</Translate>
      <span aria-hidden="true">↗</span>
    </Link>
  )
}

function GuideLink({
  docsPath,
  link,
}: {
  docsPath: (path: string) => string
  link: GuideLinkData
}) {
  return (
    <Link className={styles.guideLink} to={useBaseUrl(docsPath(link.to))}>
      <span>
        <strong>
          <Translate id={link.title.id}>{link.title.text}</Translate>
        </strong>
        <small>
          <Translate id={link.description.id}>
            {link.description.text}
          </Translate>
        </small>
      </span>
      <ArrowUpRight aria-hidden="true" size={15} strokeWidth={1.8} />
    </Link>
  )
}

export default function DeveloperLanding(): React.JSX.Element {
  const docsPath = useDocsPath()
  const firstContractPath = useBaseUrl(docsPath('/first-skel-contract'))
  const firstApplicationPath = useBaseUrl(docsPath('/tutorial-first-app'))
  const compatibilityPath = useBaseUrl(docsPath('/compatibility'))
  const productionPath = useBaseUrl(docsPath('/production-readiness'))
  const shortcutsLabel = translate({
    id: 'homepage.a11y.shortcuts',
    message: 'Overview shortcuts',
  })

  return (
    <div className={`developer-landing ${styles.landing}`}>
      <header className={styles.intro}>
        <div className={styles.kicker}>
          <span>Skel + Vine</span>
          <span aria-hidden="true">·</span>
          <span>
            <Translate id="homepage.kicker">AI programming governance</Translate>
          </span>
        </div>
        <h1>
          <Translate id="homepage.title">Overview</Translate>
        </h1>
        <p className={styles.lede}>
          <Translate id="homepage.description">
            Skel puts domain rules into contracts. Vine carries those rules
            into application assembly, calls, and runtime behavior.
          </Translate>{' '}
          <strong>
            <Translate id="homepage.description.ai">
              Together, they give AI-generated code stronger boundaries than
              review alone.
            </Translate>
          </strong>
        </p>
        <nav aria-label={shortcutsLabel} className={styles.introLinks}>
          <Link to={firstContractPath}>
            <Translate id="homepage.actions.firstContract">
              Create the first contract
            </Translate>
            <span aria-hidden="true">→</span>
          </Link>
          <Link to={firstApplicationPath}>
            <Translate id="homepage.actions.firstApplication">
              Build the first application
            </Translate>
            <span aria-hidden="true">→</span>
          </Link>
          <a href="https://skel.yorun.ai/docs/overview">
            <Translate id="homepage.actions.skel">
              Read the Skel overview
            </Translate>
            <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionLead}>
          <p className={styles.sectionIndex}>01</p>
          <div>
            <h2>
              <Translate id="homepage.sections.mechanisms.title">
                How Vine carries constraints into runtime
              </Translate>
            </h2>
            <p>
              <Translate id="homepage.sections.mechanisms.description">
                Vine is more than an Rpc wrapper. It gives application
                composition, lifecycle, execution, routing, and runtime
                feedback one consistent model.
              </Translate>
            </p>
          </div>
        </div>

        <div className={styles.mechanisms}>
          {vineMechanisms.map((mechanism, index) => (
            <article key={mechanism.title.id}>
              <div className={styles.mechanismNumber}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <small>
                  <Translate id={mechanism.label.id}>
                    {mechanism.label.text}
                  </Translate>
                </small>
              </div>
              <div className={styles.mechanismBody}>
                <h3>
                  <Translate id={mechanism.title.id}>
                    {mechanism.title.text}
                  </Translate>
                </h3>
                <p>
                  <Translate id={mechanism.description.id}>
                    {mechanism.description.text}
                  </Translate>
                </p>
                <div className={styles.markers}>
                  {mechanism.markers.map((marker) => (
                    <code key={marker}>{marker}</code>
                  ))}
                </div>
                <div className={styles.mechanismLinks}>
                  {mechanism.links.map((link) => (
                    <InlineDocLink
                      docsPath={docsPath}
                      key={link.title.id}
                      link={link}
                    />
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionLead}>
          <p className={styles.sectionIndex}>02</p>
          <div>
            <h2>
              <Translate id="homepage.sections.loop.title">
                The contract-to-runtime loop, in brief
              </Translate>
            </h2>
            <p>
              <Translate id="homepage.sections.loop.description">
                A boundary starts in .skel, becomes generated code, joins
                ApplicationSpec, and runs through Vine. Tests and runtime
                signals carry problems back into the next change.
              </Translate>
            </p>
          </div>
        </div>

        <ol className={styles.loopStages}>
          {governanceStages.map((stage, index) => (
            <li key={stage.title.id}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <div className={styles.stageHeading}>
                  <strong>
                    <Translate id={stage.title.id}>{stage.title.text}</Translate>
                  </strong>
                  <code>{stage.artifact}</code>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionLead}>
          <p className={styles.sectionIndex}>03</p>
          <div>
            <h2>
              <Translate id="homepage.sections.guides.title">
                Continue reading
              </Translate>
            </h2>
            <p>
              <Translate id="homepage.sections.guides.description">
                Start with the part you are changing.
              </Translate>
            </p>
          </div>
        </div>

        <div className={styles.guideGroups}>
          {guideGroups.map((group) => (
            <section key={group.title.id}>
              <h3>
                <Translate id={group.title.id}>{group.title.text}</Translate>
              </h3>
              <div>
                {group.links.map((link) => (
                  <GuideLink
                    docsPath={docsPath}
                    key={link.title.id}
                    link={link}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <aside className={styles.statusNote}>
        <span>
          <Translate id="homepage.status.label">Before 1.0</Translate>
        </span>
        <p>
          <Translate id="homepage.status.description">
            Vine&apos;s public API is still stabilizing. Pin reviewed Vine and
            skelc revisions, and keep runtime endpoints on a trusted network.
          </Translate>{' '}
          <Link to={compatibilityPath}>
            <Translate id="homepage.status.compatibility">
              Compatibility
            </Translate>
          </Link>
          <span aria-hidden="true"> · </span>
          <Link to={productionPath}>
            <Translate id="homepage.status.production">
              Production Checks
            </Translate>
          </Link>
        </p>
      </aside>
    </div>
  )
}
