import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { useAuth } from "../../shared/auth/AuthContext.tsx";
import { hasPermission } from "../../shared/auth/permissions.ts";
import {
  createWorkflow,
  getWorkflow,
  listDepartments,
  listWorkflowCapabilities,
  replaceWorkflowSteps,
  updateWorkflow,
  type PublicWorkflow,
  type WorkflowStepWrite,
} from "./api.ts";

type DraftStep = WorkflowStepWrite;

const EMPTY_STEP: DraftStep = {
  sortOrder: 1,
  capability: "IDENTIFY_VEHICLE",
  name: "Identify vehicle",
  isRequired: true,
};

export function WorkflowFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = hasPermission(user, "workflow.manage");
  const [workflow, setWorkflow] = useState<PublicWorkflow | null>(null);
  const [capabilities, setCapabilities] = useState<Array<{ code: string; label: string }>>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [autoContinue, setAutoContinue] = useState(false);
  const [thresholdKg, setThresholdKg] = useState("");
  const [steps, setSteps] = useState<DraftStep[]>([EMPTY_STEP]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void listWorkflowCapabilities()
      .then((result) => setCapabilities(result.capabilities))
      .catch(() => undefined);
    void listDepartments()
      .then((result) => setDepartments(result.departments))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!id) {
      return;
    }

    void getWorkflow(id)
      .then((result) => {
        setWorkflow(result.workflow);
        setCode(result.workflow.code);
        setName(result.workflow.name);
        setDescription(result.workflow.description ?? "");
        setIsActive(result.workflow.isActive);
        setAutoContinue(result.workflow.config.autoContinue);
        setThresholdKg(
          result.workflow.config.approvalThresholdKg === null
            ? ""
            : String(result.workflow.config.approvalThresholdKg),
        );
        setSteps(
          result.workflow.steps.map((step) => ({
            sortOrder: step.sortOrder,
            capability: step.capability,
            name: step.name,
            isRequired: step.isRequired,
            ...(step.approvalDepartment ? { approvalDepartmentId: step.approvalDepartment.id } : {}),
          })),
        );
      })
      .catch((caught: unknown) => {
        setError(isApiError(caught) ? caught.message : "Unable to load workflow");
      });
  }, [id]);

  function updateStep(index: number, patch: Partial<DraftStep>): void {
    setSteps((current) =>
      current.map((step, stepIndex) => (stepIndex === index ? { ...step, ...patch, sortOrder: stepIndex + 1 } : step)),
    );
  }

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
      isActive,
      config: {
        autoContinue,
        approvalThresholdKg: thresholdKg.trim() === "" ? null : Number(thresholdKg),
      },
    };

    try {
      const result = id ? await updateWorkflow(id, payload) : await createWorkflow(payload);
      const saved = await replaceWorkflowSteps(
        result.workflow.id,
        steps.map((step, index) => ({
          ...step,
          sortOrder: index + 1,
          ...(step.capability === "APPROVAL" && step.approvalDepartmentId
            ? { approvalDepartmentId: step.approvalDepartmentId }
            : {}),
        })),
      );
      navigate(`/workflows/${saved.workflow.id}`);
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Unable to save workflow");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">{id ? "Workflow configuration" : "New workflow"}</p>
          <h1>{id ? name || workflow?.code || "Workflow" : "Add workflow"}</h1>
        </div>
      </header>

      <form className="panel-form" onSubmit={(event) => void handleSubmit(event)}>
        {error ? <p className="form-error">{error}</p> : null}
        <label htmlFor="workflowCode">Workflow code</label>
        <input id="workflowCode" value={code} onChange={(event) => setCode(event.target.value)} required disabled={!canManage} />
        <label htmlFor="workflowName">Name</label>
        <input id="workflowName" value={name} onChange={(event) => setName(event.target.value)} required disabled={!canManage} />
        <label htmlFor="workflowDescription">Description</label>
        <textarea
          id="workflowDescription"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={!canManage}
        />
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
            disabled={!canManage}
          />
          Active
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={autoContinue}
            onChange={(event) => setAutoContinue(event.target.checked)}
            disabled={!canManage}
          />
          Automatic continuation below threshold
        </label>
        <label htmlFor="thresholdKg">Approval threshold (KG, optional)</label>
        <input
          id="thresholdKg"
          value={thresholdKg}
          onChange={(event) => setThresholdKg(event.target.value)}
          placeholder="Organization-specific, not a universal limit"
          disabled={!canManage}
        />

        <h2>Required steps</h2>
        <p className="login-note">Organizations choose which steps apply. These labels are not fixed industry meanings.</p>
        {steps.map((step, index) => (
          <fieldset key={`${step.capability}-${index}`} className="step-editor">
            <legend>Step {index + 1}</legend>
            <label htmlFor={`capability-${index}`}>Capability</label>
            <select
              id={`capability-${index}`}
              value={step.capability}
              onChange={(event) => updateStep(index, { capability: event.target.value })}
              disabled={!canManage}
            >
              {capabilities.map((capability) => (
                <option key={capability.code} value={capability.code}>
                  {capability.label}
                </option>
              ))}
            </select>
            <label htmlFor={`step-name-${index}`}>Name</label>
            <input
              id={`step-name-${index}`}
              value={step.name}
              onChange={(event) => updateStep(index, { name: event.target.value })}
              disabled={!canManage}
            />
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={step.isRequired}
                onChange={(event) => updateStep(index, { isRequired: event.target.checked })}
                disabled={!canManage}
              />
              Required
            </label>
            {step.capability === "APPROVAL" ? (
              <>
                <label htmlFor={`department-${index}`}>Approval department</label>
                <select
                  id={`department-${index}`}
                  value={step.approvalDepartmentId ?? ""}
                  onChange={(event) => updateStep(index, { approvalDepartmentId: event.target.value })}
                  disabled={!canManage}
                >
                  <option value="">Select department</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            {canManage && steps.length > 1 ? (
              <button
                type="button"
                className="ghost-button"
                onClick={() => setSteps((current) => current.filter((_, stepIndex) => stepIndex !== index))}
              >
                Remove step
              </button>
            ) : null}
          </fieldset>
        ))}
        {canManage ? (
          <div className="button-row">
            <button
              type="button"
              className="ghost-button"
              onClick={() =>
                setSteps((current) => [
                  ...current,
                  { ...EMPTY_STEP, sortOrder: current.length + 1, name: "New step", capability: "COMPLETE" },
                ])
              }
            >
              Add step
            </button>
            <button type="submit" disabled={saving}>
              {id ? "Save workflow" : "Create workflow"}
            </button>
          </div>
        ) : null}
      </form>
    </main>
  );
}
