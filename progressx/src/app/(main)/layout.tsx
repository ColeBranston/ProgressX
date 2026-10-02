import Navbar from "../internal_components/Navbar"
import SessionWatch from "../internal_components/SessionWatch"

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
        < Navbar />
        <SessionWatch />
        {children}
    </>
  );
}
