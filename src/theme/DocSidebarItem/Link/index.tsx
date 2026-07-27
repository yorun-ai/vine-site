import React, {type ReactNode} from 'react'
import clsx from 'clsx'
import {
  Article,
  BookOpen,
  BracketsCurly,
  Broadcast,
  ChatsCircle,
  CirclesFour,
  Code,
  Database,
  FileCode,
  Fingerprint,
  FlowArrow,
  FunnelSimple,
  GearSix,
  Globe,
  Graph,
  HardDrives,
  House,
  ListBullets,
  Package,
  Play,
  PlugsConnected,
  RocketLaunch,
  ShareNetwork,
  Stack,
  Terminal,
  Timer,
  TreeStructure,
  WarningCircle,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react'
import {isActiveSidebarItem} from '@docusaurus/plugin-content-docs/client'
import Link from '@docusaurus/Link'
import isInternalUrl from '@docusaurus/isInternalUrl'
import IconExternalLink from '@theme/Icon/ExternalLink'
import type {Props} from '@theme/DocSidebarItem/Link'

import styles from './styles.module.css'

function iconForHref(href: string): PhosphorIcon {
  if (/\/docs\/?$/.test(href)) return House
  if (href.includes('tutorial-first-app')) return Play
  if (href.includes('first-skel-contract')) return FileCode
  if (href.includes('getting-started')) return RocketLaunch
  if (href.includes('filetree')) return TreeStructure
  if (href.includes('deployment-modes')) return ShareNetwork
  if (href.endsWith('/cli')) return Terminal
  if (href.includes('application-model')) return Stack
  if (href.includes('components')) return CirclesFour
  if (href.endsWith('/di')) return FlowArrow
  if (href.endsWith('/meta')) return Fingerprint
  if (href.includes('trace-timeout')) return Timer
  if (href.endsWith('/ex')) return WarningCircle
  if (href.endsWith('/ctr')) return FunnelSimple
  if (href.includes('configuration')) return GearSix
  if (href.includes('guide/rpc') || href.endsWith('/rpc')) return Broadcast
  if (href.endsWith('/web')) return Globe
  if (href.includes('events-and-tasks')) return ChatsCircle
  if (href.includes('redis') || href.endsWith('/rdb')) return Database
  if (href.includes('logging-and-testing')) return ListBullets
  if (href.includes('runtime-mechanisms')) return Graph
  if (href.endsWith('/hub')) return HardDrives
  if (href.endsWith('/link')) return PlugsConnected
  if (href.endsWith('/portal')) return ShareNetwork
  if (href.endsWith('/app')) return BracketsCurly
  if (href.includes('vrpc-http')) return Code
  if (href.includes('core-packages')) return Package
  if (!isInternalUrl(href)) return BookOpen
  return Article
}

export default function DocSidebarItemLink({
  item,
  onItemClick,
  activePath,
  level,
  index: _index,
  ...props
}: Props): ReactNode {
  const {href, label, className, autoAddBaseUrl} = item
  const isActive = isActiveSidebarItem(item, activePath)
  const isInternalLink = isInternalUrl(href)
  const ItemIcon = iconForHref(href)

  return (
    <li
      className={clsx(
        'theme-doc-sidebar-item-link',
        `theme-doc-sidebar-item-link-level-${level}`,
        'menu__list-item',
        className,
      )}>
      <Link
        className={clsx('menu__link', {
          'menu__link--active': isActive,
        })}
        autoAddBaseUrl={autoAddBaseUrl}
        aria-current={isActive ? 'page' : undefined}
        to={href}
        {...(isInternalLink && {
          onClick: onItemClick ? () => onItemClick(item) : undefined,
        })}
        {...props}>
        <ItemIcon
          aria-hidden="true"
          className={styles.itemIcon}
          size={18}
          weight="fill"
        />
        <span className={styles.linkLabel}>{label}</span>
        {!isInternalLink && <IconExternalLink />}
      </Link>
    </li>
  )
}
