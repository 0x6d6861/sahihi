import {
  Activity01Icon as HugeActivityIcon,
  ArrowDown01Icon as HugeArrowDownIcon,
  ArrowLeft01Icon as HugeArrowLeftIcon,
  AtIcon as HugeAtSignIcon,
  UnavailableIcon as HugeBanIcon,
  Notification01Icon as HugeBellIcon,
  Calendar03Icon as HugeCalendarIcon,
  CheckmarkSquare01Icon as HugeCheckSquareIcon,
  Copy01Icon as HugeClipboardCopyIcon,
  Download01Icon as HugeDownloadIcon,
  MoreHorizontalIcon as HugeEllipsisIcon,
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
  ImageUploadIcon as HugeImageUpIcon,
  Key01Icon as HugeKeyRoundIcon,
  LicenseDraftIcon as HugeLayoutTemplateIcon,
  SquareLock02Icon as HugeLockIcon,
  Mail01Icon as HugeMailIcon,
  Cursor01Icon as HugeMousePointer2Icon,
  PackageIcon as HugePackageIcon,
  PencilEdit02Icon as HugePencilIcon,
  Pen01Icon as HugePenLineIcon,
  PlusSignIcon as HugePlusIcon,
  RotateClockwiseIcon as HugeRotateCwIcon,
  FloppyDiskIcon as HugeSaveIcon,
  Search01Icon as HugeSearchIcon,
  SentIcon as HugeSendIcon,
  Settings02Icon as HugeSettingsIcon,
  SecurityCheckIcon as HugeShieldCheckIcon,
  SignatureIcon as HugeSignatureIcon,
  Delete02Icon as HugeTrash2Icon,
  Alert02Icon as HugeTriangleAlertIcon,
  TextIcon as HugeTypeIcon,
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
export const ArrowLeftIcon = icon(HugeArrowLeftIcon)
export const AtSignIcon = icon(HugeAtSignIcon)
export const BanIcon = icon(HugeBanIcon)
export const BellIcon = icon(HugeBellIcon)
export const CalendarIcon = icon(HugeCalendarIcon)
export const CheckSquareIcon = icon(HugeCheckSquareIcon)
export const ClipboardCopyIcon = icon(HugeClipboardCopyIcon)
export const DownloadIcon = icon(HugeDownloadIcon)
export const EllipsisIcon = icon(HugeEllipsisIcon)
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
