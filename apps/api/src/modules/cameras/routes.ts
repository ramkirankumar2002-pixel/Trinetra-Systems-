import { Router } from "express";
import { routeParam } from "../../lib/routeParam.js";
import { requireAuthentication } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/authorize.js";
import { actorFromRequest } from "../shared/actor.js";
import {
  confirmIdentification,
  correctDetection,
  createCamera,
  getAnprProviderStatus,
  getCamera,
  getCameraStatus,
  getDetection,
  listCameras,
  manualIdentify,
  readDetectionFrame,
  recognizeCamera,
  rejectDetection,
  setCameraEnabled,
  testCameraConnection,
  updateCamera,
} from "./service.js";
import {
  parseCameraCreate,
  parseCameraPatch,
  parseConfirmInput,
  parseCorrectInput,
  parseManualInput,
  parseRecognizeInput,
  parseRejectInput,
} from "./validators.js";

export const cameraRouter = Router();

cameraRouter.use(requireAuthentication);

cameraRouter.get("/", requirePermission("camera.read", "weighbridge.read"), async (request, response, next) => {
  try {
    response.status(200).json(await listCameras(actorFromRequest(request)));
  } catch (error) {
    next(error);
  }
});

cameraRouter.post("/", requirePermission("camera.manage", "weighbridge.manage"), async (request, response, next) => {
  try {
    const camera = await createCamera(actorFromRequest(request), parseCameraCreate(request.body));
    response.status(201).json({ camera });
  } catch (error) {
    next(error);
  }
});

cameraRouter.get("/:id", requirePermission("camera.read", "weighbridge.read"), async (request, response, next) => {
  try {
    const camera = await getCamera(actorFromRequest(request), routeParam(request.params.id));
    response.status(200).json({ camera });
  } catch (error) {
    next(error);
  }
});

cameraRouter.patch("/:id", requirePermission("camera.manage", "weighbridge.manage"), async (request, response, next) => {
  try {
    const camera = await updateCamera(
      actorFromRequest(request),
      routeParam(request.params.id),
      parseCameraPatch(request.body),
    );
    response.status(200).json({ camera });
  } catch (error) {
    next(error);
  }
});

cameraRouter.post("/:id/enable", requirePermission("camera.manage", "weighbridge.manage"), async (request, response, next) => {
  try {
    const camera = await setCameraEnabled(actorFromRequest(request), routeParam(request.params.id), true);
    response.status(200).json({ camera });
  } catch (error) {
    next(error);
  }
});

cameraRouter.post("/:id/disable", requirePermission("camera.manage", "weighbridge.manage"), async (request, response, next) => {
  try {
    const camera = await setCameraEnabled(actorFromRequest(request), routeParam(request.params.id), false);
    response.status(200).json({ camera });
  } catch (error) {
    next(error);
  }
});

cameraRouter.post("/:id/test", requirePermission("camera.manage", "weighbridge.manage"), async (request, response, next) => {
  try {
    response.status(200).json(await testCameraConnection(actorFromRequest(request), routeParam(request.params.id)));
  } catch (error) {
    next(error);
  }
});

cameraRouter.get("/:id/status", requirePermission("camera.read", "weighbridge.read", "transaction.create"), async (request, response, next) => {
  try {
    response.status(200).json(await getCameraStatus(actorFromRequest(request), routeParam(request.params.id)));
  } catch (error) {
    next(error);
  }
});

cameraRouter.get("/:id/anpr/status", requirePermission("camera.read", "weighbridge.read", "transaction.create"), async (request, response, next) => {
  try {
    response.status(200).json({ anpr: await getAnprProviderStatus(actorFromRequest(request), routeParam(request.params.id)) });
  } catch (error) {
    next(error);
  }
});

cameraRouter.post(
  "/:id/recognize",
  requirePermission("transaction.create", "weighment.record", "camera.read"),
  async (request, response, next) => {
    try {
      const identification = await recognizeCamera(
        actorFromRequest(request),
        routeParam(request.params.id),
        parseRecognizeInput(request.body),
      );
      response.status(200).json({ identification });
    } catch (error) {
      next(error);
    }
  },
);

cameraRouter.get(
  "/:id/detections/:detectionId",
  requirePermission("transaction.create", "camera.read", "weighbridge.read"),
  async (request, response, next) => {
    try {
      const identification = await getDetection(
        actorFromRequest(request),
        routeParam(request.params.id),
        routeParam(request.params.detectionId),
      );
      response.status(200).json({ identification });
    } catch (error) {
      next(error);
    }
  },
);

cameraRouter.get(
  "/:id/detections/:detectionId/frame",
  requirePermission("transaction.create", "camera.read", "weighbridge.read"),
  async (request, response, next) => {
    try {
      const frame = await readDetectionFrame(
        actorFromRequest(request),
        routeParam(request.params.id),
        routeParam(request.params.detectionId),
      );
      response.setHeader("Cache-Control", "private, no-store");
      response.type(frame.mimeType).send(frame.bytes);
    } catch (error) {
      next(error);
    }
  },
);

cameraRouter.post(
  "/:id/detections/:detectionId/correct",
  requirePermission("transaction.create", "weighment.record"),
  async (request, response, next) => {
    try {
      const identification = await correctDetection(
        actorFromRequest(request),
        routeParam(request.params.id),
        routeParam(request.params.detectionId),
        parseCorrectInput(request.body),
      );
      response.status(200).json({ identification });
    } catch (error) {
      next(error);
    }
  },
);

cameraRouter.post(
  "/:id/identify/manual",
  requirePermission("transaction.create", "weighment.record"),
  async (request, response, next) => {
    try {
      const identification = await manualIdentify(
        actorFromRequest(request),
        routeParam(request.params.id),
        parseManualInput(request.body),
      );
      response.status(200).json({ identification });
    } catch (error) {
      next(error);
    }
  },
);

cameraRouter.post(
  "/:id/detections/:detectionId/confirm",
  requirePermission("transaction.create", "transaction.update"),
  async (request, response, next) => {
    try {
      const identification = await confirmIdentification(
        actorFromRequest(request),
        routeParam(request.params.id),
        routeParam(request.params.detectionId),
        parseConfirmInput(request.body),
      );
      response.status(200).json({ identification });
    } catch (error) {
      next(error);
    }
  },
);

cameraRouter.post(
  "/:id/detections/:detectionId/reject",
  requirePermission("transaction.create", "transaction.update"),
  async (request, response, next) => {
    try {
      const identification = await rejectDetection(
        actorFromRequest(request),
        routeParam(request.params.id),
        routeParam(request.params.detectionId),
        parseRejectInput(request.body),
      );
      response.status(200).json({ identification });
    } catch (error) {
      next(error);
    }
  },
);
