import Navbar from "../internal_components/Navbar"

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
        < Navbar />
        {children}
    </>
  );
}
