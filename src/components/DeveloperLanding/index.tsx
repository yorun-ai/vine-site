import React from 'react'
import Link from '@docusaurus/Link'
import Translate, {translate} from '@docusaurus/Translate'
import useBaseUrl from '@docusaurus/useBaseUrl'
import {useDocsVersion} from '@docusaurus/plugin-content-docs/client'
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Braces,
  GitBranch,
  Network,
  RadioTower,
  Rocket,
  Route,
  RotateCcw,
  ShieldCheck,
  Waypoints,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import {
  governanceStages,
  guideGroups,
  runtimeRoles,
  vineMechanisms,
  type DocLink,
  type GuideGroup as GuideGroupData,
  type GuideLink as GuideLinkData,
  type MechanismIcon,
  type RuntimeRole as RuntimeRoleData,
  type VineMechanism,
} from '../../data/developerLanding'
import styles from './styles.module.css'

const mechanismIcons: Record<MechanismIcon, LucideIcon> = {
  composition: Boxes,
  lifecycle: Activity,
  execution: Workflow,
  exposure: Route,
  feedback: RadioTower,
  topology: Network,
}

const runtimeRoleIcons: Record<RuntimeRoleData['icon'], LucideIcon> = {
  hub: RadioTower,
  portal: ShieldCheck,
  link: Waypoints,
  application: Boxes,
}

const guideGroupIcons: Record<GuideGroupData['icon'], LucideIcon> = {
  contract: Braces,
  application: Rocket,
  runtime: GitBranch,
}

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
      <ArrowRight aria-hidden="true" size={14} strokeWidth={1.9} />
    </Link>
  )
}

function RuntimeRole({role}: {role: RuntimeRoleData}) {
  const RoleIcon = runtimeRoleIcons[role.icon]

  return (
    <div className={styles.runtimeRole} data-role={role.icon}>
      <span className={styles.runtimeRoleIcon}>
        <RoleIcon aria-hidden="true" size={16} strokeWidth={1.8} />
      </span>
      <span>
        <strong>
          <Translate id={role.title.id}>{role.title.text}</Translate>
        </strong>
        <small>
          <Translate id={role.description.id}>
            {role.description.text}
          </Translate>
        </small>
      </span>
    </div>
  )
}

function MechanismCard({
  docsPath,
  mechanism,
}: {
  docsPath: (path: string) => string
  mechanism: VineMechanism
}) {
  const MechanismIcon = mechanismIcons[mechanism.icon]

  return (
    <article className={styles.mechanismCard}>
      <div className={styles.mechanismMeta}>
        <span className={styles.mechanismIcon}>
          <MechanismIcon aria-hidden="true" size={19} strokeWidth={1.8} />
        </span>
        <span>
          <Translate id={mechanism.label.id}>{mechanism.label.text}</Translate>
        </span>
      </div>
      <h3>
        <Translate id={mechanism.title.id}>{mechanism.title.text}</Translate>
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
    </article>
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
      <span className={styles.guideArrow}>
        <ArrowRight aria-hidden="true" size={16} strokeWidth={1.8} />
      </span>
    </Link>
  )
}

export default function DeveloperLanding(): React.JSX.Element {
  const docsPath = useDocsPath()
  const firstApplicationPath = useBaseUrl(docsPath('/tutorial-first-app'))
  const architecturePath = useBaseUrl(docsPath('/runtime-mechanisms'))
  const compatibilityPath = useBaseUrl(docsPath('/compatibility'))
  const productionPath = useBaseUrl(docsPath('/production-readiness'))
  const actionsLabel = translate({
    id: 'homepage.a11y.actions',
    message: 'Overview actions',
  })
  const topologyLabel = translate({
    id: 'homepage.a11y.topologies',
    message: 'Supported runtime topologies',
  })
  const heroTitle = translate({
    id: 'homepage.title',
    message: 'Keep application boundaries intact at runtime.',
  })
  const heroTitleBreak = heroTitle.indexOf('，')

  return (
    <div className={`developer-landing ${styles.landing}`}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.kicker}>
            <span>
              <Translate id="homepage.kicker">Vine for Go applications</Translate>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <Translate id="homepage.kicker.detail">
                Contract-aware runtime
              </Translate>
            </span>
          </div>
          <h1>
            {heroTitleBreak >= 0 ? (
              <>
                <span>{heroTitle.slice(0, heroTitleBreak + 1)}</span>
                <span>{heroTitle.slice(heroTitleBreak + 1)}</span>
              </>
            ) : (
              heroTitle
            )}
          </h1>
          <p className={styles.lede}>
            <Translate id="homepage.description">
              Skel defines capabilities as typed contracts. Vine carries them
              through application composition, lifecycle, routing, and
              delivery.
            </Translate>{' '}
            <strong>
              <Translate id="homepage.description.emphasis">
                Start in one process, then separate runtime roles without
                rewriting business modules.
              </Translate>
            </strong>
          </p>

          <nav aria-label={actionsLabel} className={styles.actions}>
            <Link className={styles.primaryAction} to={firstApplicationPath}>
              <Translate id="homepage.actions.firstApplication">
                Build your first application
              </Translate>
              <ArrowRight aria-hidden="true" size={16} strokeWidth={2} />
            </Link>
            <Link className={styles.secondaryAction} to={architecturePath}>
              <Translate id="homepage.actions.architecture">
                Explore the architecture
              </Translate>
            </Link>
          </nav>

          <p className={styles.skelPrompt}>
            <Translate id="homepage.actions.skelPrompt">
              Defining the contract first?
            </Translate>{' '}
            <a href="https://skel.yorun.ai/docs/overview">
              <Translate id="homepage.actions.skel">
                Read the Skel overview
              </Translate>
              <ArrowUpRight aria-hidden="true" size={13} strokeWidth={1.9} />
            </a>
          </p>
        </div>

        <figure className={styles.runtimeMap}>
          <figcaption>
            <span>
              <Translate id="homepage.runtime.caption">
                Runtime architecture
              </Translate>
            </span>
            <small>
              <Translate id="homepage.runtime.caption.detail">
                One application model
              </Translate>
            </small>
          </figcaption>

          <div
            aria-label={topologyLabel}
            className={styles.topologies}
            role="group"
          >
            <code>standalone</code>
            <ArrowRight aria-hidden="true" size={13} strokeWidth={1.8} />
            <code>linked</code>
            <ArrowRight aria-hidden="true" size={13} strokeWidth={1.8} />
            <code>separated</code>
          </div>

          <div className={styles.runtimeRoles}>
            {runtimeRoles.map((role) => (
              <RuntimeRole key={role.icon} role={role} />
            ))}
          </div>

          <div className={styles.requestRoute}>
            <span>
              <Translate id="homepage.runtime.route.label">
                External request
              </Translate>
            </span>
            <div>
              <small>
                <Translate id="homepage.runtime.route.client">
                  Client
                </Translate>
              </small>
              <ArrowRight aria-hidden="true" size={14} strokeWidth={1.8} />
              <strong>Portal</strong>
              <ArrowRight aria-hidden="true" size={14} strokeWidth={1.8} />
              <strong>Link</strong>
              <ArrowRight aria-hidden="true" size={14} strokeWidth={1.8} />
              <strong>
                <Translate id="homepage.runtime.route.application">
                  App
                </Translate>
              </strong>
            </div>
          </div>

          <p className={styles.runtimeNote}>
            <ShieldCheck aria-hidden="true" size={14} strokeWidth={1.8} />
            <span>
              <Translate id="homepage.runtime.note">
                Internal calls enter Link directly. Hub distributes state and
                stays off the synchronous request path.
              </Translate>
            </span>
          </p>
        </figure>
      </header>

      <section
        aria-labelledby="vine-capabilities-title"
        className={styles.section}
      >
        <div className={styles.sectionLead}>
          <p className={styles.eyebrow}>
            <Translate id="homepage.sections.mechanisms.eyebrow">
              Runtime guarantees
            </Translate>
          </p>
          <div>
            <h2 id="vine-capabilities-title">
              <Translate id="homepage.sections.mechanisms.title">
                The boundaries Vine keeps explicit
              </Translate>
            </h2>
            <p>
              <Translate id="homepage.sections.mechanisms.description">
                Composition, execution, and topology use one model, so
                generated capabilities stay reviewable after code leaves the
                contract.
              </Translate>
            </p>
          </div>
        </div>

        <div className={styles.mechanismGrid}>
          {vineMechanisms.map((mechanism) => (
            <MechanismCard
              docsPath={docsPath}
              key={mechanism.title.id}
              mechanism={mechanism}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="vine-workflow-title" className={styles.section}>
        <div className={styles.sectionLead}>
          <p className={styles.eyebrow}>
            <Translate id="homepage.sections.loop.eyebrow">Workflow</Translate>
          </p>
          <div>
            <h2 id="vine-workflow-title">
              <Translate id="homepage.sections.loop.title">
                A short path from declaration to feedback
              </Translate>
            </h2>
            <p>
              <Translate id="homepage.sections.loop.description">
                Each step produces a boundary the next step can inspect,
                keeping generated code and runtime behavior connected to the
                original intent.
              </Translate>
            </p>
          </div>
        </div>

        <div className={styles.workflowPanel}>
          <ol className={styles.workflowStages}>
            {governanceStages.map((stage, index) => (
              <li key={stage.title.id}>
                <div className={styles.stageMeta}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <code>{stage.artifact}</code>
                </div>
                <h3>
                  <Translate id={stage.title.id}>{stage.title.text}</Translate>
                </h3>
                <p>
                  <Translate id={stage.description.id}>
                    {stage.description.text}
                  </Translate>
                </p>
              </li>
            ))}
          </ol>
          <div className={styles.workflowReturn}>
            <RotateCcw aria-hidden="true" size={16} strokeWidth={1.8} />
            <span>
              <Translate id="homepage.loop.feedback">
                Tests and runtime signals become the next contract change.
              </Translate>
            </span>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="vine-reading-paths-title"
        className={styles.section}
      >
        <div className={styles.sectionLead}>
          <p className={styles.eyebrow}>
            <Translate id="homepage.sections.guides.eyebrow">
              Documentation paths
            </Translate>
          </p>
          <div>
            <h2 id="vine-reading-paths-title">
              <Translate id="homepage.sections.guides.title">
                Continue by the work in front of you
              </Translate>
            </h2>
            <p>
              <Translate id="homepage.sections.guides.description">
                Pick a path for the boundary you are defining, building, or
                operating.
              </Translate>
            </p>
          </div>
        </div>

        <div className={styles.guideGroups}>
          {guideGroups.map((group) => {
            const GroupIcon = guideGroupIcons[group.icon]

            return (
              <article className={styles.guideGroup} key={group.title.id}>
                <div className={styles.guideGroupIcon}>
                  <GroupIcon aria-hidden="true" size={20} strokeWidth={1.8} />
                </div>
                <h3>
                  <Translate id={group.title.id}>{group.title.text}</Translate>
                </h3>
                <p>
                  <Translate id={group.description.id}>
                    {group.description.text}
                  </Translate>
                </p>
                <div className={styles.guideLinks}>
                  {group.links.map((link) => (
                    <GuideLink
                      docsPath={docsPath}
                      key={link.title.id}
                      link={link}
                    />
                  ))}
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <aside className={styles.statusNote}>
        <div className={styles.statusLabel}>
          <GitBranch aria-hidden="true" size={16} strokeWidth={1.8} />
          <span>
            <Translate id="homepage.status.label">Before 1.0</Translate>
          </span>
        </div>
        <div>
          <strong>
            <Translate id="homepage.status.title">
              Pin the runtime you review.
            </Translate>
          </strong>
          <p>
            <Translate id="homepage.status.description">
              Vine&apos;s public API is still stabilizing. Pin reviewed Vine
              and skelc revisions, and keep runtime endpoints on a trusted
              network.
            </Translate>
          </p>
        </div>
        <div className={styles.statusLinks}>
          <Link to={compatibilityPath}>
            <Translate id="homepage.status.compatibility">
              Compatibility
            </Translate>
            <ArrowRight aria-hidden="true" size={14} strokeWidth={1.8} />
          </Link>
          <Link to={productionPath}>
            <Translate id="homepage.status.production">
              Production checks
            </Translate>
            <ArrowRight aria-hidden="true" size={14} strokeWidth={1.8} />
          </Link>
        </div>
      </aside>
    </div>
  )
}
