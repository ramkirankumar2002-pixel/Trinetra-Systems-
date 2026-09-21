import { Router } from "express";
import { routeParam } from "../../lib/routeParam.js";
import { requireAuthentication } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/authorize.js";
import { actorFromRequest } from "../shared/actor.js";
import {
  applyOnboardingStep,
  cancelOnboarding,
  completeOnboarding,
  createOnboardingSession,
  getOnboardingSession,
  getValidationResults,
  hardwareOnboardingChecks,
  listOnboardingSessions,
  pilotReadinessCheck,
  runPilotTest,
  validateOnboarding,
} from "./service.js";
import { parseApplyStepInput, parseCreateOnboardingInput, parseNotes } from "./validators.js";

export const onboardingRouter = Router();

onboardingRouter.use(requireAuthentication);

onboardingRouter.get("/", requirePermission("onboarding.view"), async (request, response, next) => {
  try {
    response.status(200).json(await listOnboardingSessions(actorFromRequest(request)));
  } catch (error) {
    next(error);
  }
});

onboardingRouter.post("/", requirePermission("onboarding.create"), async (request, response, next) => {
  try {
    const session = await createOnboardingSession(actorFromRequest(request), parseCreateOnboardingInput(request.body));
    response.status(201).json({ session });
  } catch (error) {
    next(error);
  }
});

onboardingRouter.get("/:id", requirePermission("onboarding.view"), async (request, response, next) => {
  try {
    response.status(200).json(await getOnboardingSession(actorFromRequest(request), routeParam(request.params.id)));
  } catch (error) {
    next(error);
  }
});

onboardingRouter.patch("/:id/step", requirePermission("onboarding.edit"), async (request, response, next) => {
  try {
    const result = await applyOnboardingStep(
      actorFromRequest(request),
      routeParam(request.params.id),
      parseApplyStepInput(request.body),
    );
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

onboardingRouter.post("/:id/validate", requirePermission("onboarding.validate"), async (request, response, next) => {
  try {
    response.status(200).json(await validateOnboarding(actorFromRequest(request), routeParam(request.params.id)));
  } catch (error) {
    next(error);
  }
});

onboardingRouter.get("/:id/validation", requirePermission("onboarding.view", "onboarding.validate"), async (request, response, next) => {
  try {
    response.status(200).json(await getValidationResults(actorFromRequest(request), routeParam(request.params.id)));
  } catch (error) {
    next(error);
  }
});

onboardingRouter.post("/:id/hardware-checks", requirePermission("onboarding.validate", "onboarding.edit"), async (request, response, next) => {
  try {
    response.status(200).json(await hardwareOnboardingChecks(actorFromRequest(request), routeParam(request.params.id)));
  } catch (error) {
    next(error);
  }
});

onboardingRouter.post("/:id/readiness", requirePermission("onboarding.validate"), async (request, response, next) => {
  try {
    response.status(200).json(await pilotReadinessCheck(actorFromRequest(request), routeParam(request.params.id)));
  } catch (error) {
    next(error);
  }
});

onboardingRouter.post("/:id/pilot-test", requirePermission("onboarding.validate", "onboarding.complete"), async (request, response, next) => {
  try {
    response.status(200).json(await runPilotTest(actorFromRequest(request), routeParam(request.params.id)));
  } catch (error) {
    next(error);
  }
});

onboardingRouter.post("/:id/complete", requirePermission("onboarding.complete"), async (request, response, next) => {
  try {
    response.status(200).json(await completeOnboarding(actorFromRequest(request), routeParam(request.params.id)));
  } catch (error) {
    next(error);
  }
});

onboardingRouter.post("/:id/cancel", requirePermission("onboarding.cancel"), async (request, response, next) => {
  try {
    const session = await cancelOnboarding(
      actorFromRequest(request),
      routeParam(request.params.id),
      parseNotes(request.body),
    );
    response.status(200).json({ session });
  } catch (error) {
    next(error);
  }
});
