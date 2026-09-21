import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { useAuth } from "../../shared/auth/AuthContext.tsx";
import { hasPermission } from "../../shared/auth/permissions.ts";
import { listWorkflows, type PublicWorkflow } from "../workflows/api.ts";
import {
  assignMaterialWorkflow,
  createMaterial,
  getMaterial,
  listMaterialUnits,
  setMaterialActive,
  updateMaterial,
  type PublicMaterial,
} from "./api.ts";

export function MaterialFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = hasPermission(user, "material.manage");
  const canConfigureWorkflow = hasPermission(user, "workflow.manage", "material.manage");
  const [material, setMaterial] = useState<PublicMaterial | null>(null);
  const [units, setUnits] = useState<Array<{ code: string; label: string }>>([]);
  const [workflows, setWorkflows] = useState<PublicWorkflow[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [unitOfMeasure, setUnitOfMeasure] = useState("MT");
  const [workflowId, setWorkflowId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void listMaterialUnits()
      .then((result) => setUnits(result.units))
      .catch(() => undefined);
    void listWorkflows(new URLSearchParams({ isActive: "true" }))
      .then((result) => setWorkflows(result.workflows))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!id) {
      return;
    }

    void getMaterial(id)
      .then((result) => {
        setMaterial(result.material);
        setCode(result.material.code);
        setName(result.material.name);
        setDescription(result.material.description ?? "");
        setUnitOfMeasure(result.material.unitOfMeasure);
        setWorkflowId(result.material.defaultWorkflow?.workflow.id ?? "");
      })
      .catch((caught: unknown) => {
        setError(isApiError(caught) ? caught.message : "Unable to load material");
      });
  }, [id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canManage) {
      return;
    }

    setSaving(true);
    setError(null);
    const payload = {
      code,
      name,
      description,
      unitOfMeasure,
    };

    try {
      const result = id ? await updateMaterial(id, payload) : await createMaterial(payload);
      if (canConfigureWorkflow && workflowId !== "") {
        await assignMaterialWorkflow(result.material.id, workflowId);
      }
      navigate(`/materials/${result.material.id}`);
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Unable to save material");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(): Promise<void> {
    if (!id || !material) {
      return;
    }

    try {
      const result = await setMaterialActive(id, !material.isActive);
      setMaterial(result.material);
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Unable to update material status");
    }
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">{id ? "Material details" : "New material"}</p>
          <h1>{id ? name || "Material" : "Add material"}</h1>
        </div>
        {id && canManage && material ? (
          <button type="button" className="ghost-button" onClick={() => void handleToggle()}>
            {material.isActive ? "Deactivate" : "Activate"}
          </button>
        ) : null}
      </header>

      <form className="panel-form" onSubmit={(event) => void handleSubmit(event)}>
        {error ? <p className="form-error">{error}</p> : null}
        <label htmlFor="materialCode">Material code</label>
        <input id="materialCode" value={code} onChange={(event) => setCode(event.target.value)} required disabled={!canManage} />
        <label htmlFor="materialName">Material name</label>
        <input id="materialName" value={name} onChange={(event) => setName(event.target.value)} required disabled={!canManage} />
        <label htmlFor="materialDescription">Description</label>
        <textarea
          id="materialDescription"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={!canManage}
        />
        <label htmlFor="unitOfMeasure">Unit of measure</label>
        <select
          id="unitOfMeasure"
          value={unitOfMeasure}
          onChange={(event) => setUnitOfMeasure(event.target.value)}
          disabled={!canManage}
        >
          {units.map((unit) => (
            <option key={unit.code} value={unit.code}>
              {unit.label}
            </option>
          ))}
        </select>
        <label htmlFor="workflowId">Workflow</label>
        <select
          id="workflowId"
          value={workflowId}
          onChange={(event) => setWorkflowId(event.target.value)}
          disabled={!canConfigureWorkflow}
        >
          <option value="">Not configured</option>
          {workflows.map((workflow) => (
            <option key={workflow.id} value={workflow.id}>
              {workflow.code} — {workflow.name}
            </option>
          ))}
        </select>
        <p className="login-note">
          Workflow type is organization configuration. It is not a universal industry rule for this material.
        </p>
        {canManage ? (
          <button type="submit" disabled={saving}>
            {id ? "Save material" : "Create material"}
          </button>
        ) : null}
      </form>
    </main>
  );
}
