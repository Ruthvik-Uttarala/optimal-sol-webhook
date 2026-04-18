import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { EventsPage } from "../pages/EventsPage";
import { EventDetailPage } from "../pages/EventDetailPage";
import { SystemStatusPage } from "../pages/SystemStatusPage";
import { useSessionStore } from "../store/useSessionStore";

const queryState = vi.hoisted(() => ({
  responses: new Map<string, unknown>()
}));

vi.mock("../hooks/useApiQuery", () => ({
  useApiQuery: (_key: unknown[], path: string) => ({
    data: queryState.responses.get(path),
    isLoading: false,
    error: null
  })
}));

function renderRoute(path: string, element: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/events" element={<EventsPage />} />
        <Route path="/events/:eventId" element={<EventDetailPage />} />
        <Route path="/system-status" element={<SystemStatusPage />} />
        <Route path="*" element={element} />
      </Routes>
    </MemoryRouter>
  );
}

describe("LPR metadata visibility", () => {
  beforeEach(() => {
    queryState.responses = new Map();
    useSessionStore.setState({
      user: {
        uid: "uid_admin_001",
        email: "admin@parkingsol.local",
        displayName: "Admin",
        role: "admin",
        status: "active"
      },
      access: [],
      currentLotId: "lot_demo_001",
      currentOrganizationId: "org_demo_001",
      authMode: "firebase",
      bootstrapStatus: "authenticated",
      bootstrapMessage: null,
      bootstrapCode: null,
      unreadCount: 0,
      notifications: [],
      isBootstrapped: true
    });
  });

  it("shows LPR source metadata in the events list", async () => {
    queryState.responses.set("/events", [
      {
        id: "evt_lpr_001",
        capturedAt: "2026-04-16T15:00:00.000Z",
        normalizedPlate: "LPR1234",
        sourceDirection: "unknown",
        cameraLabel: "Laptop Webcam Demo",
        cameraName: "laptop-webcam-01",
        cameraId: "cam_laptop_01",
        sourceType: "webcam_lpr",
        plateConfidence: 0.94,
        detectorConfidence: 0.91,
        frameConsensusCount: 4,
        processingStatus: "processed",
        decisionStatus: "pending_review",
        manualReviewRequired: true,
        evidenceCount: 2,
        violationId: null
      }
    ]);

    renderRoute("/events", <EventsPage />);

    expect(await screen.findByText("Laptop Webcam Demo")).toBeInTheDocument();
    expect(screen.getByText(/webcam_lpr/)).toBeInTheDocument();
    expect(screen.getByText("OCR 0.94")).toBeInTheDocument();
    expect(screen.getByText("Detector 0.91")).toBeInTheDocument();
    expect(screen.getByText("Consensus 4 • Evidence 2")).toBeInTheDocument();
  });

  it("shows evidence and recognition metadata on the event detail page", async () => {
    queryState.responses.set("/events/evt_lpr_001", {
      id: "evt_lpr_001",
      normalizedPlate: "LPR1234",
      sourceName: "Laptop Webcam Demo",
      sourceType: "webcam_lpr",
      cameraLabel: "Laptop Webcam Demo",
      cameraName: "laptop-webcam-01",
      cameraId: "cam_laptop_01",
      detectorConfidence: 0.91,
      plateConfidence: 0.94,
      frameConsensusCount: 4,
      decisionStatus: "unpaid",
      processingStatus: "processed",
      manualReviewRequired: false,
      evidenceRefs: [
        {
          label: "frame",
          path: "evidence/frame-001.jpg",
          contentType: "image/jpeg"
        }
      ],
      recognitionMetadata: {
        consensusPlate: "LPR1234"
      },
      lprModelInfo: {
        detector: "yolov8n-license-plate"
      },
      webhookDelivery: {
        status: "accepted"
      },
      debug: {}
    });
    queryState.responses.set("/events/evt_lpr_001/audit", []);

    renderRoute("/events/evt_lpr_001", <EventDetailPage />);

    expect(await screen.findByText("Source type: webcam_lpr")).toBeInTheDocument();
    expect(screen.getByText("Detector confidence: 0.91")).toBeInTheDocument();
    expect(screen.getByText("Consensus frames: 4")).toBeInTheDocument();
    expect(screen.getByText("frame")).toBeInTheDocument();
    expect(screen.getByText("evidence/frame-001.jpg")).toBeInTheDocument();
    expect(screen.getByText("Webhook delivery: accepted")).toBeInTheDocument();
    expect(screen.getByText(/yolov8n-license-plate/)).toBeInTheDocument();
  });

  it("shows last LPR health on the system status page", async () => {
    queryState.responses.set("/system/status", {
      healthy: true,
      lastLprEventReceived: "2026-04-16T15:00:00.000Z",
      lastLprPlate: "LPR1234",
      lastLprCamera: "Laptop Webcam Demo",
      lastLprDecision: "unpaid",
      lastLprConfidence: 0.94,
      lastLprDetectorConfidence: 0.91,
      lastLprConsensusCount: 4,
      lastLprWebhookStatus: "accepted"
    });
    queryState.responses.set("/system/config", {});

    renderRoute("/system-status", <SystemStatusPage />);

    expect(await screen.findByText("LPR Status")).toBeInTheDocument();
    expect(screen.getByText("Last plate: LPR1234")).toBeInTheDocument();
    expect(screen.getByText("Camera: Laptop Webcam Demo")).toBeInTheDocument();
    expect(screen.getByText("Webhook status: accepted")).toBeInTheDocument();
  });
});
