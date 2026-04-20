import Header from '@/components/Header';
import Footer from '@/components/Footer';

export default function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <div className="flex-1" role="main">
        {children}
      </div>
      <Footer />
    </div>
  );
}
