import React, {type ReactNode} from 'react'
import {GithubLogoIcon} from '@phosphor-icons/react'
import OriginalDefaultNavbarItem from '@theme-original/NavbarItem/DefaultNavbarItem'
import type {Props} from '@theme/NavbarItem/DefaultNavbarItem'

export default function DefaultNavbarItem(props: Props): ReactNode {
  if (props.mobile || !props.className?.includes('navbar-github-link')) {
    return <OriginalDefaultNavbarItem {...props} />
  }

  const githubProps = {
    ...props,
    'aria-label': 'GitHub',
    label: (
      <GithubLogoIcon
        aria-hidden="true"
        className="navbar-github-icon"
        size={16}
        weight="fill"
      />
    ),
  } as unknown as Props

  return <OriginalDefaultNavbarItem {...githubProps} />
}
