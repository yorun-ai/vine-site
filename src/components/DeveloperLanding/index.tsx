import React, {type ComponentType} from 'react';
import Link from '@docusaurus/Link';
import Translate from '@docusaurus/Translate';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {
  Blocks,
  Braces,
  Code2,
  Layers3,
  Network,
  PackageOpen,
  Rocket,
  ServerCog,
  SquareTerminal,
} from 'lucide-react';
import styles from './styles.module.css';

type LandingCard = {
  titleId: string;
  title: string;
  descriptionId: string;
  description: string;
  to: string;
  icon: ComponentType<{size?: number; strokeWidth?: number}>;
};

const gettingStarted: LandingCard[] = [
  {
    titleId: 'homepage.cards.quickStart.title',
    title: 'Quick start',
    descriptionId: 'homepage.cards.quickStart.description',
    description: 'Create a minimal Vine application and learn its core structure.',
    to: '/docs/tutorial-first-app',
    icon: Rocket,
  },
  {
    titleId: 'homepage.cards.applicationModel.title',
    title: 'Application model',
    descriptionId: 'homepage.cards.applicationModel.description',
    description: 'Understand applications, components, modules, and lifecycle.',
    to: '/docs/application-model',
    icon: Layers3,
  },
  {
    titleId: 'homepage.cards.dependencyInjection.title',
    title: 'Dependency injection',
    descriptionId: 'homepage.cards.dependencyInjection.description',
    description: 'Connect capabilities through explicit, testable dependencies.',
    to: '/docs/di',
    icon: Network,
  },
  {
    titleId: 'homepage.cards.example.title',
    title: 'Example application',
    descriptionId: 'homepage.cards.example.description',
    description: 'Explore a complete application built with Vine conventions.',
    to: '/docs/getting-started',
    icon: Code2,
  },
];

const guides: LandingCard[] = [
  {
    titleId: 'homepage.cards.rpc.title',
    title: 'RPC services',
    descriptionId: 'homepage.cards.rpc.description',
    description: 'Define and call services with consistent runtime contracts.',
    to: '/docs/guide/rpc',
    icon: Braces,
  },
  {
    titleId: 'homepage.cards.web.title',
    title: 'Web applications',
    descriptionId: 'homepage.cards.web.description',
    description: 'Build HTTP endpoints while keeping business code independent.',
    to: '/docs/web',
    icon: SquareTerminal,
  },
  {
    titleId: 'homepage.cards.events.title',
    title: 'Events and tasks',
    descriptionId: 'homepage.cards.events.description',
    description: 'Run asynchronous workflows using events and background tasks.',
    to: '/docs/events-and-tasks',
    icon: Blocks,
  },
  {
    titleId: 'homepage.cards.runtime.title',
    title: 'Runtime and deployment',
    descriptionId: 'homepage.cards.runtime.description',
    description: 'Move from a local process to distributed Vine runtimes.',
    to: '/docs/runtime-mechanisms',
    icon: ServerCog,
  },
  {
    titleId: 'homepage.cards.packages.title',
    title: 'Package reference',
    descriptionId: 'homepage.cards.packages.description',
    description: 'Browse the framework packages and their responsibilities.',
    to: '/docs/core-packages',
    icon: PackageOpen,
  },
];

function Card({card}: {card: LandingCard}) {
  const Icon = card.icon;
  const localizedPath = useBaseUrl(card.to);

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
          <Translate id="homepage.sections.guides">Guides</Translate>
        </h2>
        <CardGrid cards={guides} />
      </section>
    </div>
  );
}
