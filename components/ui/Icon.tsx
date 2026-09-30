import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconArrowLeft,
  IconArrowsExchange,
  IconAt,
  IconBan,
  IconBell,
  IconBookmark,
  IconBuildingChurch,
  IconCalendar,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconCircleCheck,
  IconClock,
  IconCopy,
  IconDeviceIpad,
  IconDots,
  IconDownload,
  IconExternalLink,
  IconEye,
  IconTag,
  IconFileSpreadsheet,
  IconHome,
  IconHourglass,
  IconInfoCircle,
  IconKey,
  IconLayoutDashboard,
  IconLock,
  IconLogout,
  IconMail,
  IconMapPin,
  IconMessageCircle,
  IconMoon,
  IconPencil,
  IconPhone,
  IconPlayerPlay,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSend,
  IconSettings,
  IconShield,
  IconShieldCheck,
  IconTrash,
  IconUpload,
  IconUser,
  IconUserCheck,
  IconUserPlus,
  IconUsers,
  IconUsersGroup,
  IconWorld,
  IconX,
  type Icon as TablerIcon,
} from '@tabler/icons-react'
import type { CSSProperties } from 'react'

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
  CircleCheck: IconCircleCheck,
  Switch: IconArrowsExchange,
  Clock: IconClock,
  MapPin: IconMapPin,
  Message: IconMessageCircle,
  Lock: IconLock,
  Pencil: IconPencil,
  Ban: IconBan,
  Trash: IconTrash,
  Mail: IconMail,
  Plus: IconPlus,
  Search: IconSearch,
  ChevronRight: IconChevronRight,
  ChevronDown: IconChevronDown,
  Alert: IconAlertTriangle,
  Info: IconInfoCircle,
  Moon: IconMoon,
  Phone: IconPhone,
  Hourglass: IconHourglass,
  Play: IconPlayerPlay,
  Key: IconKey,
  Reply: IconArrowBackUp,
  At: IconAt,
  UserCheck: IconUserCheck,
  UserPlus: IconUserPlus,
  Upload: IconUpload,
  Copy: IconCopy,
  Refresh: IconRefresh,
  Settings: IconSettings,
  Spreadsheet: IconFileSpreadsheet,
  ExternalLink: IconExternalLink,
  ArrowLeft: IconArrowLeft,
  Eye: IconEye,
  Tag: IconTag,
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
  style?: CSSProperties
}

/**
 * Tabler-ikon med appens standardlinje (1.75). Visa alltid ikonen med en
 * synlig text bredvid, eller ge den en label.
 */
export default function Icon({ name, size = 20, stroke = 1.75, label, className, style }: Props) {
  const Cmp: TablerIcon = (ICONS as Record<string, TablerIcon>)[name] ?? IconDots
  const merged = { flexShrink: 0, ...style }
  return label
    ? <Cmp size={size} stroke={stroke} className={className} style={merged} role="img" aria-label={label} />
    : <Cmp size={size} stroke={stroke} className={className} style={merged} aria-hidden="true" focusable="false" />
}

/** Datum, tid och plats med ikoner, t.ex. i passkort och modaler. */
export function PassMeta({ date, time, plats, className = 'pass-meta' }: {
  date?: string; time?: string; plats?: string; className?: string
}) {
  return (
    <div className={className}>
      {date && <span><Icon name="Calendar" size={16} className="pass-meta-icon" />{date}</span>}
      {time && <span><Icon name="Clock" size={16} className="pass-meta-icon" />{time}</span>}
      {plats && <span><Icon name="MapPin" size={16} className="pass-meta-icon" />{plats}</span>}
    </div>
  )
}
