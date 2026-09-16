/**
 * 设置侧栏的「组合」数据模型。
 *
 * 侧栏不再平铺 16+ 项，而是只列 5 个组合入口（桌宠本体 / 模型与感官 / 自主运行 /
 * 安全与权限 / 连接与运维）；点击组合进入卡片页（settings/group/<id>），页内每个
 * 成员渲染为一张卡片，点卡片进入真正的设置子页。
 *
 * 该模块同时被 layouts/settings.vue（侧栏 + 活动项检测 + 返回按钮）与
 * pages/settings/components/settings-group-hub.vue（卡片渲染）消费，是唯一数据源。
 */

export interface SettingsGroupMember {
  id: string
  labelKey: string
  icon: string
  to: string
  descriptionKey: string
  match: string[]
  exclude?: string[]
}

export interface SettingsGroup {
  id: string
  labelKey: string
  icon: string
  to: string
  descriptionKey: string
  members: SettingsGroupMember[]
}

export const settingsGroups: SettingsGroup[] = [
  {
    id: 'pet',
    labelKey: 'settings.nav.group.pet',
    icon: 'i-solar:ghost-bold-duotone',
    to: '/settings/group/pet',
    descriptionKey: 'settings.groups.pet.description',
    members: [
      {
        id: 'system',
        labelKey: 'settings.nav.system',
        icon: 'i-solar:settings-bold-duotone',
        to: '/settings/system',
        descriptionKey: 'settings.groups.cards.system.description',
        match: ['/settings/system'],
      },
      {
        id: 'scene',
        labelKey: 'settings.nav.scene',
        icon: 'i-solar:gallery-bold-duotone',
        to: '/settings/scene',
        descriptionKey: 'settings.groups.cards.scene.description',
        match: ['/settings/scene'],
      },
      {
        id: 'modules',
        labelKey: 'settings.nav.modules',
        icon: 'i-solar:widget-bold-duotone',
        to: '/settings/modules',
        descriptionKey: 'settings.groups.cards.modules.description',
        match: ['/settings/modules', '/settings/memory', '/settings/connection', '/settings/kitsune-card'],
        exclude: ['/settings/modules/speech', '/settings/modules/hearing', '/settings/modules/consciousness', '/settings/modules/vision'],
      },
      {
        id: 'data',
        labelKey: 'settings.nav.data',
        icon: 'i-solar:database-bold-duotone',
        to: '/settings/data',
        descriptionKey: 'settings.groups.cards.data.description',
        match: ['/settings/data', '/settings/flux'],
      },
      {
        id: 'account',
        labelKey: 'settings.nav.account',
        icon: 'i-solar:user-bold-duotone',
        to: '/settings/account',
        descriptionKey: 'settings.groups.cards.account.description',
        match: ['/settings/account'],
      },
      {
        id: 'kitsune-card',
        labelKey: 'settings.nav.kitsune-card',
        icon: 'i-solar:card-bold-duotone',
        to: '/settings/kitsune-card',
        descriptionKey: 'settings.groups.cards.kitsune-card.description',
        match: ['/settings/kitsune-card'],
      },
    ],
  },
  {
    id: 'senses',
    labelKey: 'settings.nav.group.senses',
    icon: 'i-solar:eye-bold-duotone',
    to: '/settings/group/senses',
    descriptionKey: 'settings.groups.senses.description',
    members: [
      {
        id: 'models',
        labelKey: 'settings.nav.models',
        icon: 'i-solar:cpu-bolt-bold-duotone',
        to: '/settings/models',
        descriptionKey: 'settings.groups.cards.models.description',
        match: ['/settings/models', '/settings/providers/chat', '/settings/providers/vision'],
      },
      {
        id: 'speech',
        labelKey: 'settings.nav.speech',
        icon: 'i-solar:microphone-bold-duotone',
        to: '/settings/modules/speech',
        descriptionKey: 'settings.groups.cards.speech.description',
        match: ['/settings/modules/speech', '/settings/providers/speech'],
      },
      {
        id: 'hearing',
        labelKey: 'settings.nav.hearing',
        icon: 'i-solar:microphone-3-bold-duotone',
        to: '/settings/modules/hearing',
        descriptionKey: 'settings.groups.cards.hearing.description',
        match: ['/settings/modules/hearing', '/settings/providers/transcription'],
      },
      {
        id: 'connection',
        labelKey: 'settings.nav.connection',
        icon: 'i-solar:link-bold-duotone',
        to: '/settings/connection',
        descriptionKey: 'settings.groups.cards.connection.description',
        match: ['/settings/connection'],
      },
    ],
  },
  {
    id: 'run',
    labelKey: 'settings.nav.group.run',
    icon: 'i-solar:diagram-up-bold-duotone',
    to: '/settings/group/run',
    descriptionKey: 'settings.groups.run.description',
    members: [
      {
        id: 'pipeline',
        labelKey: 'settings.nav.pipeline',
        icon: 'i-solar:diagram-up-bold-duotone',
        to: '/settings/pipeline',
        descriptionKey: 'settings.groups.cards.pipeline.description',
        match: ['/settings/pipeline'],
      },
      {
        id: 'director',
        labelKey: 'settings.nav.director',
        icon: 'i-solar:clipboard-check-bold-duotone',
        to: '/settings/director',
        descriptionKey: 'settings.groups.cards.director.description',
        match: ['/settings/director'],
      },
      {
        id: 'executor',
        labelKey: 'settings.nav.executor',
        icon: 'i-solar:play-bold-duotone',
        to: '/settings/executor',
        descriptionKey: 'settings.groups.cards.executor.description',
        match: ['/settings/executor'],
      },
      {
        id: 'overseer',
        labelKey: 'settings.nav.overseer',
        icon: 'i-solar:eye-bold-duotone',
        to: '/settings/overseer',
        descriptionKey: 'settings.groups.cards.overseer.description',
        match: ['/settings/overseer'],
      },
      {
        id: 'team',
        labelKey: 'settings.nav.team',
        icon: 'i-solar:users-group-rounded-bold-duotone',
        to: '/settings/team',
        descriptionKey: 'settings.groups.cards.team.description',
        match: ['/settings/team'],
      },
    ],
  },
  {
    id: 'security',
    labelKey: 'settings.nav.group.security',
    icon: 'i-solar:shield-check-bold-duotone',
    to: '/settings/group/security',
    descriptionKey: 'settings.groups.security.description',
    members: [
      {
        id: 'environment',
        labelKey: 'settings.nav.environment',
        icon: 'i-solar:planet-bold-duotone',
        to: '/settings/environment',
        descriptionKey: 'settings.groups.cards.environment.description',
        match: ['/settings/environment'],
      },
      {
        id: 'whitelist',
        labelKey: 'settings.nav.whitelist',
        icon: 'i-solar:shield-check-bold-duotone',
        to: '/settings/whitelist',
        descriptionKey: 'settings.groups.cards.whitelist.description',
        match: ['/settings/whitelist'],
      },
    ],
  },
  {
    id: 'ops',
    labelKey: 'settings.nav.group.ops',
    icon: 'i-solar:server-bold-duotone',
    to: '/settings/group/ops',
    descriptionKey: 'settings.groups.ops.description',
    members: [
      {
        id: 'connectors',
        labelKey: 'settings.nav.connectors',
        icon: 'i-solar:plug-circle-bold-duotone',
        to: '/settings/connectors',
        descriptionKey: 'settings.groups.cards.connectors.description',
        match: ['/settings/connectors'],
      },
      {
        id: 'mcp-agent',
        labelKey: 'settings.nav.mcp-agent',
        icon: 'i-solar:plug-circle-bold-duotone',
        to: '/settings/mcp-agent',
        descriptionKey: 'settings.groups.cards.mcp-agent.description',
        match: ['/settings/mcp-agent'],
      },
      {
        id: 'sidecar',
        labelKey: 'settings.nav.sidecar',
        icon: 'i-solar:server-bold-duotone',
        to: '/settings/sidecar',
        descriptionKey: 'settings.groups.cards.sidecar.description',
        match: ['/settings/sidecar'],
      },
      {
        id: 'health',
        labelKey: 'settings.nav.health',
        icon: 'i-solar:health-bold-duotone',
        to: '/settings/health',
        descriptionKey: 'settings.groups.cards.health.description',
        match: ['/settings/health'],
      },
    ],
  },
]