import { redirectIfSignedIn } from "@/lib/api-server"

export default async function Layout({ children }: { children: React.ReactNode }) {
  await redirectIfSignedIn()
  return children
}
