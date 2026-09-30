import {
  IconBell,
  IconBookmark,
  IconBuildingChurch,
  IconCalendar,
  IconCheck,
  IconDeviceIpad,
  IconDots,
  IconDownload,
  IconHome,
  IconLayoutDashboard,
  IconLogout,
  IconSend,
  IconShield,
  IconShieldCheck,
  IconUser,
  IconUsers,
  IconUsersGroup,
  IconWorld,
  IconX,
  IconArrowsExchange,
  type Icon as TablerIcon,
} from '@tabler/icons-react'

// Namnen är desamma som i NAV_ITEMS (lib/appData.ts), plus några extra.
const ICONS = {
  Home: IconHome,
  Calendar: IconCalendar,
  Bookmark: IconBookmark,
  Bell: IconBell,
  User: IconUser,
  ShieldCheck: IconShieldCheck,
  Users: IconUsers,
  UsersGroup: IconUsersGroup,
  Send: IconSend,
  Shield: IconShield,
  Download: IconDownload,
  LayoutDashboard: IconLayoutDashboard,
  BuildingChurch: IconBuildingChurch,
  World: IconWorld,
  DeviceIpad: IconDeviceIpad,
  Logout: IconLogout,
  Dots: IconDots,
  X: IconX,
  Check: IconCheck,
  Switch: IconArrowsExchange,
} satisfies Record<string, TablerIcon>

export type IconName = keyof typeof ICONS

interface Props {
  name: IconName | string
  size?: number
  stroke?: number
  /**
   * Beskrivning för skärmläsare. Utelämna när ikonen står bredvid en text,
   * då döljs ikonen för skärmläsare.
   */
  label?: string
  className?: string
}

/**
 * Tabler-ikon med appens standardlinje (1.75). Visa alltid ikonen med en
 * synlig text bredvid, eller ge den en label.
 */
export default function Icon({ name, size = 20, stroke = 1.75, label, className }: Props) {
  const Cmp: TablerIcon = (ICONS as Record<string, TablerIcon>)[name] ?? IconDots
  return label
    ? <Cmp size={size} stroke={stroke} className={className} role="img" aria-label={label} />
    : <Cmp size={size} stroke={stroke} className={className} aria-hidden="true" focusable="false" />
}
