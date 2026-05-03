export type AttachmentRow = {
  createdAt: Date;
  fileName: string;
  id: string;
  mimeType: string;
  ownerId: string;
  purpose: string;
  sizeBytes: number;
  status: string;
  storageKey: string;
};

export type AttachmentSummary = {
  attachment_id: string;
  created_at: string;
  file_name: string;
  mime_type: string;
  owner_id: string;
  purpose: string;
  size_bytes: number;
  status: string;
};

export type AttachmentInitResponse = {
  attachment: AttachmentSummary;
  upload: {
    expires_in: number;
    method: 'PUT';
    url: string;
  };
};

export type AttachmentAccessResponse = {
  attachment: AttachmentSummary;
  download: {
    expires_in: number;
    method: 'GET';
    url: string;
  };
};

export function toAttachmentSummary(row: AttachmentRow): AttachmentSummary {
  return {
    attachment_id: row.id,
    created_at: row.createdAt.toISOString(),
    file_name: row.fileName,
    mime_type: row.mimeType,
    owner_id: row.ownerId,
    purpose: row.purpose,
    size_bytes: row.sizeBytes,
    status: row.status,
  };
}
