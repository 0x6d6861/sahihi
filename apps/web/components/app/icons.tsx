import {
  Activity01Icon as HugeActivityIcon,
  ArrowDown01Icon as HugeArrowDownIcon,
  ArrowLeft01Icon as HugeArrowLeftIcon,
  ArrowUp02Icon as HugeArrowUpIcon,
  AtIcon as HugeAtSignIcon,
  UnavailableIcon as HugeBanIcon,
  Notification01Icon as HugeBellIcon,
  TextBoldIcon as HugeBoldIcon,
  BracketsIcon as HugeBracesIcon,
  Calendar03Icon as HugeCalendarIcon,
  Tick02Icon as HugeCheckIcon,
  CheckmarkSquare01Icon as HugeCheckSquareIcon,
  ArrowRight01Icon as HugeChevronRightIcon,
  AlertCircleIcon as HugeCircleAlertIcon,
  CheckmarkCircle02Icon as HugeCircleCheckIcon,
  CancelCircleIcon as HugeCircleXIcon,
  Copy01Icon as HugeClipboardCopyIcon,
  TimeQuarterPassIcon as HugeClockAlertIcon,
  Download01Icon as HugeDownloadIcon,
  MoreHorizontalIcon as HugeEllipsisIcon,
  MoreVerticalIcon as HugeEllipsisVerticalIcon,
  EraserIcon as HugeEraserIcon,
  ViewIcon as HugeEyeIcon,
  FileEditIcon as HugeFilePenLineIcon,
  FileSearchIcon as HugeFileSearchIcon,
  Xls01Icon as HugeFileSpreadsheetIcon,
  File02Icon as HugeFileTextIcon,
  FilterHorizontalIcon as HugeFilterIcon,
  Folder01Icon as HugeFolderIcon,
  FolderTransferIcon as HugeFolderInputIcon,
  FolderAddIcon as HugeFolderPlusIcon,
  Home01Icon as HugeHomeIcon,
  HourglassIcon as HugeHourglassIcon,
  ImageUploadIcon as HugeImageUpIcon,
  TextItalicIcon as HugeItalicIcon,
  Key01Icon as HugeKeyRoundIcon,
  LicenseDraftIcon as HugeLayoutTemplateIcon,
  LeftToRightListBulletIcon as HugeListIcon,
  LeftToRightListNumberIcon as HugeListOrderedIcon,
  Loading03Icon as HugeLoaderIcon,
  SquareLock02Icon as HugeLockIcon,
  Mail01Icon as HugeMailIcon,
  MailSend01Icon as HugeMailSendIcon,
  Cursor01Icon as HugeMousePointer2Icon,
  PackageIcon as HugePackageIcon,
  Pdf02Icon as HugePdfIcon,
  PencilEdit02Icon as HugePencilIcon,
  Pen01Icon as HugePenLineIcon,
  PlusSignIcon as HugePlusIcon,
  Redo02Icon as HugeRedoIcon,
  RotateClockwiseIcon as HugeRotateCwIcon,
  FloppyDiskIcon as HugeSaveIcon,
  Search01Icon as HugeSearchIcon,
  SentIcon as HugeSendIcon,
  Settings02Icon as HugeSettingsIcon,
  SecurityCheckIcon as HugeShieldCheckIcon,
  SignatureIcon as HugeSignatureIcon,
  AiMagicIcon as HugeSparklesIcon,
  StopIcon as HugeStopIcon,
  TableIcon as HugeTableIcon,
  Tag01Icon as HugeTagIcon,
  Delete02Icon as HugeTrash2Icon,
  Alert02Icon as HugeTriangleAlertIcon,
  TextIcon as HugeTypeIcon,
  TextUnderlineIcon as HugeUnderlineIcon,
  Undo02Icon as HugeUndoIcon,
  Upload01Icon as HugeUploadIcon,
  UserIcon as HugeUserIcon,
  UserRemove01Icon as HugeUserMinusIcon,
  UserAdd01Icon as HugeUserPlusIcon,
  UserGroupIcon as HugeUsersIcon,
  WebhookIcon as HugeWebhookIcon,
  Cancel01Icon as HugeXIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type HugeiconsIconProps, type IconSvgElement } from "@hugeicons/react"

/**
 * The app's icon set (docs/ui.md → Icons): HugeIcons glyphs exported as components under the
 * names our code used with lucide, so a component can still be passed by reference (field-type
 * maps, Extend `FileUpload` file types). Add new icons here rather than importing an icon
 * library in a page. Vendored `components/ui` and `components/extend` keep their own icons.
 */
export type AppIconProps = Omit<HugeiconsIconProps, "icon">

/** 16px by default, the glyph size Arc controls are drawn for; a `size-*` class still wins. */
function icon(glyph: IconSvgElement) {
  const Icon = (props: AppIconProps) => (
    <HugeiconsIcon icon={glyph} size={16} strokeWidth={1.75} {...props} />
  )
  return Icon
}

export const ActivityIcon = icon(HugeActivityIcon)
export const ArrowDownIcon = icon(HugeArrowDownIcon)
export const ArrowUpIcon = icon(HugeArrowUpIcon)
export const ChevronRightIcon = icon(HugeChevronRightIcon)
export const UndoIcon = icon(HugeUndoIcon)
export const RedoIcon = icon(HugeRedoIcon)
export const StopIcon = icon(HugeStopIcon)
export const ArrowLeftIcon = icon(HugeArrowLeftIcon)
export const AtSignIcon = icon(HugeAtSignIcon)
export const BanIcon = icon(HugeBanIcon)
export const BellIcon = icon(HugeBellIcon)
export const CalendarIcon = icon(HugeCalendarIcon)
export const CheckSquareIcon = icon(HugeCheckSquareIcon)
export const ClipboardCopyIcon = icon(HugeClipboardCopyIcon)
export const DownloadIcon = icon(HugeDownloadIcon)
export const EllipsisIcon = icon(HugeEllipsisIcon)
export const EllipsisVerticalIcon = icon(HugeEllipsisVerticalIcon)
export const EraserIcon = icon(HugeEraserIcon)
export const EyeIcon = icon(HugeEyeIcon)
export const FilePenLineIcon = icon(HugeFilePenLineIcon)
export const FileSearchIcon = icon(HugeFileSearchIcon)
export const FileSpreadsheetIcon = icon(HugeFileSpreadsheetIcon)
export const FileTextIcon = icon(HugeFileTextIcon)
export const FilterIcon = icon(HugeFilterIcon)
export const FolderIcon = icon(HugeFolderIcon)
export const FolderInputIcon = icon(HugeFolderInputIcon)
export const FolderPlusIcon = icon(HugeFolderPlusIcon)
export const HomeIcon = icon(HugeHomeIcon)
export const ImageUpIcon = icon(HugeImageUpIcon)
export const KeyRoundIcon = icon(HugeKeyRoundIcon)
export const LayoutTemplateIcon = icon(HugeLayoutTemplateIcon)
export const LockIcon = icon(HugeLockIcon)
export const MailIcon = icon(HugeMailIcon)
export const MousePointer2Icon = icon(HugeMousePointer2Icon)
export const PdfIcon = icon(HugePdfIcon)
export const PackageIcon = icon(HugePackageIcon)
export const PencilIcon = icon(HugePencilIcon)
export const PenLineIcon = icon(HugePenLineIcon)
export const PlusIcon = icon(HugePlusIcon)
export const RotateCwIcon = icon(HugeRotateCwIcon)
export const SaveIcon = icon(HugeSaveIcon)
export const SearchIcon = icon(HugeSearchIcon)
export const SendIcon = icon(HugeSendIcon)
export const SettingsIcon = icon(HugeSettingsIcon)
export const ShieldCheckIcon = icon(HugeShieldCheckIcon)
export const SignatureIcon = icon(HugeSignatureIcon)
export const SparklesIcon = icon(HugeSparklesIcon)
export const TagIcon = icon(HugeTagIcon)
export const Trash2Icon = icon(HugeTrash2Icon)
export const TriangleAlertIcon = icon(HugeTriangleAlertIcon)
export const TypeIcon = icon(HugeTypeIcon)
export const UploadIcon = icon(HugeUploadIcon)
export const UserIcon = icon(HugeUserIcon)
export const UserMinusIcon = icon(HugeUserMinusIcon)
export const UserPlusIcon = icon(HugeUserPlusIcon)
export const UsersIcon = icon(HugeUsersIcon)
export const WebhookIcon = icon(HugeWebhookIcon)
export const XIcon = icon(HugeXIcon)
export const CheckIcon = icon(HugeCheckIcon)
export const CircleAlertIcon = icon(HugeCircleAlertIcon)
export const CircleCheckIcon = icon(HugeCircleCheckIcon)
export const CircleXIcon = icon(HugeCircleXIcon)
export const ClockAlertIcon = icon(HugeClockAlertIcon)
export const HourglassIcon = icon(HugeHourglassIcon)
export const LoaderIcon = icon(HugeLoaderIcon)
export const MailSendIcon = icon(HugeMailSendIcon)
export const BoldIcon = icon(HugeBoldIcon)
export const ItalicIcon = icon(HugeItalicIcon)
export const UnderlineIcon = icon(HugeUnderlineIcon)
export const ListIcon = icon(HugeListIcon)
export const ListOrderedIcon = icon(HugeListOrderedIcon)
export const TableIcon = icon(HugeTableIcon)
export const BracesIcon = icon(HugeBracesIcon)
