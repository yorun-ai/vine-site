import React, {type ComponentType} from 'react';
import Link from '@docusaurus/Link';
import Translate from '@docusaurus/Translate';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {useDocsVersion} from '@docusaurus/plugin-content-docs/client';
import {
  BadgeCheck,
  Blocks,
  Braces,
  Layers3,
  Network,
  PackageOpen,
  Rocket,
  ServerCog,
  ShieldCheck,
  SquareTerminal,
} from 'lucide-react';
import {
  gettingStarted,
  guides,
  type LandingCard,
  type LandingIcon,
} from '../../data/developerLanding';
import styles from './styles.module.css';

const icons: Record<
  LandingIcon,
  ComponentType<{size?: number; strokeWidth?: number}>
> = {
  'badge-check': BadgeCheck,
  blocks: Blocks,
  braces: Braces,
  layers: Layers3,
  network: Network,
  package: PackageOpen,
  rocket: Rocket,
  server: ServerCog,
  shield: ShieldCheck,
  terminal: SquareTerminal,
};

function Card({card}: {card: LandingCard}) {
  const Icon = icons[card.icon];
  const {isLast, version} = useDocsVersion();
  const docsBase = isLast
    ? '/docs'
    : version === 'current'
      ? '/docs/next'
      : `/docs/${version}`;
  const localizedPath = useBaseUrl(`${docsBase}${card.to}`);

  return (
    <Link className={styles.card} to={localizedPath}>
      <div className={styles.cardVisual}>
        <Icon size={20} strokeWidth={1.8} />
      </div>
      <div className={styles.cardBody}>
        <h3>
          <Translate id={card.titleId}>{card.title}</Translate>
        </h3>
        <p>
          <Translate id={card.descriptionId}>{card.description}</Translate>
        </p>
      </div>
    </Link>
  );
}

function CardGrid({cards}: {cards: LandingCard[]}) {
  return (
    <div className={styles.grid}>
      {cards.map((card) => (
        <Card card={card} key={card.to} />
      ))}
    </div>
  );
}

export default function DeveloperLanding(): React.JSX.Element {
  return (
    <div className={`developer-landing ${styles.landing}`}>
      <header className={styles.intro}>
        <span className={styles.eyebrow}>Vine</span>
        <h1>
          <Translate id="homepage.title">Vine Developers</Translate>
        </h1>
        <p>
          <Translate id="homepage.description">
            Build evolvable Go applications with explicit contracts.
          </Translate>
        </p>
      </header>

      <section className={styles.section}>
        <h2>
          <Translate id="homepage.sections.gettingStarted">
            Getting started
          </Translate>
        </h2>
        <CardGrid cards={gettingStarted} />
      </section>

      <section className={styles.section}>
        <h2>
          <Translate id="homepage.sections.guides">Build and operate</Translate>
        </h2>
        <CardGrid cards={guides} />
      </section>
    </div>
  );
}
