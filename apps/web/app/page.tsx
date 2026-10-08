import { redirect } from "next/navigation"
import { HOME_HREF } from "@/lib/nav"

export default function Home() {
  redirect(HOME_HREF)
}
