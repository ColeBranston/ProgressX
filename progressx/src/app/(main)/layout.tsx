import Navbar from "../internal_components/Navbar"
import SessionWatch from "../internal_components/SessionWatch"
import ReleaseNotes from "../internal_components/releases/ReleaseNotes"

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
        < Navbar />
        <SessionWatch />
        <ReleaseNotes />
        {children}
    </>
  );
}
