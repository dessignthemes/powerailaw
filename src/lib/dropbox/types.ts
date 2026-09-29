// Shared between the Dropbox API routes and the Dropbox page.

export type DropboxEntry = {
  id: string;
  type: "folder" | "file";
  name: string;
  path: string; // display path, e.g. "/Clients/Smith/Retainer.pdf"
  size: number | null;
  modified: string | null;
};

export type DropboxStatus =
  | { configured: false }
  | { configured: true; connected: false }
  | { configured: true; connected: true; email: string | null; name: string | null; teamSpace: boolean };
