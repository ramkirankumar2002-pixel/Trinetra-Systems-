import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { useAuth } from "../../shared/auth/AuthContext.tsx";
import { hasPermission } from "../../shared/auth/permissions.ts";
import { StatusPill } from "../../shared/ui/StatusPill.tsx";
import { listWorkflows, type PublicWorkflow } from "./api.ts";

export function WorkflowListPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<PublicWorkflow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const canManage = hasPermission(user, "workflow.manage");

  useEffect(() => {
    void listWorkflows()
      .then((result) => {
        setItems(result.workflows);
        setError(null);
      })
      .catch((caught: unknown) => {
        setError(isApiError(caught) ? caught.message : "Unable to load workflows");
      });
  }, []);

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">Configuration</p>
          <h1>Workflows</h1>
        </div>
        {canManage ? (
          <Link to="/workflows/new" className="primary-link">
            Add workflow
          </Link>
        ) : null}
      </header>

      <p className="login-note">
        TYPE 1, TYPE 2, and TYPE 3 are configurable categories. They are not universal material rules.
      </p>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Required steps</th>
              <th>Approvals</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((workflow) => (
              <tr key={workflow.id}>
                <td>
                  <Link to={`/workflows/${workflow.id}`}>{workflow.code}</Link>
                </td>
                <td>{workflow.name}</td>
                <td>{workflow.steps.filter((step) => step.isRequired).length}</td>
                <td>
                  {workflow.steps
                    .filter((step) => step.capability === "APPROVAL" && step.approvalDepartment)
                    .map((step) => step.approvalDepartment?.name)
                    .join(", ") || "None"}
                </td>
                <td>
                  <StatusPill value={workflow.isActive ? "AVAILABLE" : "OFFLINE"} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
