import { Link, useLocation } from 'react-router-dom'

export default function Navbar() {
  const { pathname } = useLocation()

  const link = (to: string, label: string) => (
    <Link
      to={to}
      className={`text-sm transition-colors ${pathname === to ? 'text-white' : 'text-gray-400 hover:text-white'}`}
    >
      {label}
    </Link>
  )

  return (
    <nav className="sticky top-0 z-50 border-b border-gray-800 bg-gray-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-lg font-bold bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
            ⬡ AgentMarket
          </span>
        </Link>

        <div className="flex items-center gap-6">
          {link('/marketplace', 'Browse')}
          {link('/list', 'List Agent')}
          {link('/my-listings', 'My Listings')}
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/admin"
            className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
              pathname === '/admin'
                ? 'border-red-500/50 bg-red-500/10 text-red-400'
                : 'border-gray-800 text-gray-600 hover:border-gray-700 hover:text-gray-400'
            }`}
          >
            Admin
          </Link>
          <Link
            to="/list"
            className="text-sm px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 transition-colors font-medium"
          >
            List your agent
          </Link>
        </div>
      </div>
    </nav>
  )
}
