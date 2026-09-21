import { NavLink, Outlet } from "react-router-dom";

export function IntegrationsLayout() {
  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">Integrations</p>
          <h1>Integration platform</h1>
        </div>
        <nav className="button-row">
          <NavLink to="/integrations" end className="text-link">
            Overview
          </NavLink>
          <NavLink to="/integrations/applications" className="text-link">
            Applications
          </NavLink>
          <NavLink to="/integrations/deliveries" className="text-link">
            Delivery logs
          </NavLink>
          <NavLink to="/integrations/usage" className="text-link">
            API usage
          </NavLink>
        </nav>
      </header>
      <Outlet />
    </main>
  );
}
