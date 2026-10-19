const crypto = require('crypto');

const TOKEN_MIN_BYTES = 32;
const WORKSPACE_ID_MAX_LENGTH = 128;
const CONTENT_TYPES = new Set(['explainer', 'tutorial', 'list', 'review', 'story']);
const LENGTHS = new Set(['short', 'medium', 'long']);

function digest(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest();
}

function requireElenaIntegrationToken() {
  return (req, res, next) => {
    const configuredToken = process.env.ELENA_INTEGRATION_TOKEN;
    if (
      typeof configuredToken !== 'string' ||
      configuredToken.trim() !== configuredToken ||
      Buffer.byteLength(configuredToken, 'utf8') < TOKEN_MIN_BYTES
    ) {
      return res.status(503).json({ success: false, error: 'ELENA integration is disabled' });
    }

    const authorization = req.get('authorization') || '';
    const match = authorization.match(/^Bearer\s+(\S+)$/i);
    const suppliedToken = match ? match[1] : '';
    if (!crypto.timingSafeEqual(digest(suppliedToken), digest(configuredToken))) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    return next();
  };
}

function validateRequest(body, configuredWorkspaceId, allowedFields) {
  if (
    typeof configuredWorkspaceId !== 'string' ||
    !configuredWorkspaceId ||
    configuredWorkspaceId.trim() !== configuredWorkspaceId ||
    configuredWorkspaceId.length > WORKSPACE_ID_MAX_LENGTH
  ) {
    return { valid: false, status: 503, error: 'ELENA workspace binding is not configured' };
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, status: 400, error: 'Request body must be a JSON object' };
  }

  const unknownFields = Object.keys(body).filter(key => !allowedFields.includes(key));
  if (unknownFields.length) {
    return { valid: false, status: 400, error: 'Request contains unsupported fields' };
  }

  if (typeof body.workspaceId !== 'string' || !body.workspaceId.trim()) {
    return { valid: false, status: 400, error: 'workspaceId is required' };
  }
  if (body.workspaceId !== configuredWorkspaceId) {
    return { valid: false, status: 403, error: 'ELENA workspace is not authorized for this instance' };
  }

  if (typeof body.topic !== 'string' || !body.topic.trim() || body.topic.trim().length > 200) {
    return { valid: false, status: 400, error: 'topic must be a non-empty string of at most 200 characters' };
  }

  const value = {
    workspaceId: configuredWorkspaceId,
    topic: body.topic.trim()
  };

  if (allowedFields.includes('angle') && body.angle !== undefined) {
    if (typeof body.angle !== 'string' || body.angle.trim().length > 500) {
      return { valid: false, status: 400, error: 'angle must be a string of at most 500 characters' };
    }
    value.angle = body.angle.trim();
  }

  if (allowedFields.includes('contentType') && body.contentType !== undefined) {
    if (typeof body.contentType !== 'string' || !CONTENT_TYPES.has(body.contentType.trim().toLowerCase())) {
      return { valid: false, status: 400, error: 'contentType must be explainer, tutorial, list, review, or story' };
    }
    value.contentType = body.contentType.trim().toLowerCase();
  }

  if (allowedFields.includes('length') && body.length !== undefined) {
    if (typeof body.length !== 'string' || !LENGTHS.has(body.length.trim().toLowerCase())) {
      return { valid: false, status: 400, error: 'length must be short, medium, or long' };
    }
    value.length = body.length.trim().toLowerCase();
  }

  return { valid: true, value };
}

function validateResearchRequest(body, configuredWorkspaceId) {
  return validateRequest(body, configuredWorkspaceId, ['workspaceId', 'topic']);
}

function validateDraftRequest(body, configuredWorkspaceId) {
  return validateRequest(body, configuredWorkspaceId, [
    'workspaceId',
    'topic',
    'angle',
    'contentType',
    'length'
  ]);
}

module.exports = {
  requireElenaIntegrationToken,
  validateResearchRequest,
  validateDraftRequest
};
