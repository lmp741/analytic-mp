import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Analytic MP</h1>
        <nav className="space-y-2">
          <Link href="/upload" className="block text-blue-600 hover:underline">
            Загрузка данных
          </Link>
          <Link href="/wb" className="block text-blue-600 hover:underline">
            WB Dashboard
          </Link>
          <Link href="/ozon" className="block text-blue-600 hover:underline">
            Ozon Dashboard
          </Link>
          <Link href="/summary" className="block text-blue-600 hover:underline">
            Summary
          </Link>
          <Link href="/ab-tests" className="block text-blue-600 hover:underline">
            AB Tests
          </Link>
          <Link href="/month" className="block text-blue-600 hover:underline">
            Month Summary
          </Link>
          <Link href="/settings" className="block text-blue-600 hover:underline">
            Settings
          </Link>
        </nav>
      </div>
    </main>
  );
}
