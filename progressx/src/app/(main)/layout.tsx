import { cookies } from "next/headers"
import Navbar from "../internal_components/Navbar"
import SessionWatch from "../internal_components/SessionWatch"
import ReleaseNotes from "../internal_components/releases/ReleaseNotes"
import { ViewerProvider } from "../contexts/viewer"
import { ACCESS_COOKIE, REFRESH_COOKIE } from "../api/libs/session"

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The middleware only lets visitors without a login reach the public pages (and removes the cookies
  // of a login that has ended), so a login cookie here means a signed-in user
  const store = await cookies()
  const signedIn = store.has(ACCESS_COOKIE) || store.has(REFRESH_COOKIE)

  return (
    <ViewerProvider signedIn={signedIn}>
        <Navbar />
        {/* logging out after inactivity and release notes only apply to someone signed in */}
        {signedIn ? <SessionWatch /> : null}
        {signedIn ? <ReleaseNotes /> : null}
        {children}
    </ViewerProvider>
  );
}
