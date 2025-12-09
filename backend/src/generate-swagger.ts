import swaggerJsdoc from 'swagger-jsdoc';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ArchiTrack API',
      version: '1.0.0',
      description: 'ArchiTrack Backend REST API Documentation',
      contact: {
        name: 'ArchiTrack Team',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
      {
        url: 'https://api.architrack.com',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT authentication token',
        },
      },
      schemas: {
        // Project Management Schemas
        UserRef: {
          type: 'object',
          description: 'User reference with id and display name',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'User ID',
            },
            displayName: {
              type: 'string',
              description: 'User display name',
            },
          },
        },
        ProjectStatus: {
          type: 'string',
          description: 'Project status enum',
          enum: [
            'PREPARING',
            'SURVEYING',
            'ESTIMATING',
            'APPROVING',
            'CONTRACTING',
            'CONSTRUCTING',
            'DELIVERING',
            'BILLING',
            'AWAITING',
            'COMPLETED',
            'CANCELLED',
            'LOST',
          ],
        },
        TransitionType: {
          type: 'string',
          description: 'Status transition type',
          enum: ['initial', 'forward', 'backward', 'terminate'],
        },
        PaginationInfo: {
          type: 'object',
          description: 'Pagination metadata',
          properties: {
            page: {
              type: 'integer',
              description: 'Current page number',
              example: 1,
            },
            limit: {
              type: 'integer',
              description: 'Items per page',
              example: 20,
            },
            total: {
              type: 'integer',
              description: 'Total number of items',
              example: 100,
            },
            totalPages: {
              type: 'integer',
              description: 'Total number of pages',
              example: 5,
            },
          },
        },
        ProjectInfo: {
          type: 'object',
          description: 'Project summary information',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Project ID',
            },
            name: {
              type: 'string',
              description: 'Project name',
              example: 'New Construction Project',
            },
            customerName: {
              type: 'string',
              description: 'Customer name',
              example: 'ABC Corporation',
            },
            salesPerson: {
              $ref: '#/components/schemas/UserRef',
            },
            constructionPerson: {
              $ref: '#/components/schemas/UserRef',
            },
            siteAddress: {
              type: 'string',
              nullable: true,
              description: 'Site address',
              example: 'Tokyo, Chiyoda-ku',
            },
            description: {
              type: 'string',
              nullable: true,
              description: 'Project description',
            },
            status: {
              $ref: '#/components/schemas/ProjectStatus',
            },
            statusLabel: {
              type: 'string',
              description: 'Status display label',
              example: 'Preparing',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Creation timestamp',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Last update timestamp',
            },
          },
        },
        ProjectDetail: {
          type: 'object',
          description: 'Project detailed information',
          allOf: [
            { $ref: '#/components/schemas/ProjectInfo' },
            {
              type: 'object',
              properties: {
                createdBy: {
                  $ref: '#/components/schemas/UserRef',
                },
              },
            },
          ],
        },
        CreateProjectRequest: {
          type: 'object',
          description: 'Request body for creating a project',
          required: ['name', 'customerName', 'salesPersonId'],
          properties: {
            name: {
              type: 'string',
              description: 'Project name (1-255 characters)',
              minLength: 1,
              maxLength: 255,
              example: 'New Construction Project',
            },
            customerName: {
              type: 'string',
              description: 'Customer name (1-255 characters)',
              minLength: 1,
              maxLength: 255,
              example: 'ABC Corporation',
            },
            salesPersonId: {
              type: 'string',
              format: 'uuid',
              description: 'Sales person user ID',
            },
            constructionPersonId: {
              type: 'string',
              format: 'uuid',
              nullable: true,
              description: 'Construction person user ID (optional)',
            },
            siteAddress: {
              type: 'string',
              maxLength: 500,
              nullable: true,
              description: 'Site address (optional, max 500 characters)',
            },
            description: {
              type: 'string',
              maxLength: 2000,
              nullable: true,
              description: 'Project description (optional, max 2000 characters)',
            },
          },
        },
        UpdateProjectRequest: {
          type: 'object',
          description: 'Request body for updating a project (with optimistic locking)',
          required: ['expectedUpdatedAt'],
          properties: {
            name: {
              type: 'string',
              description: 'Project name (1-255 characters)',
              minLength: 1,
              maxLength: 255,
            },
            customerName: {
              type: 'string',
              description: 'Customer name (1-255 characters)',
              minLength: 1,
              maxLength: 255,
            },
            salesPersonId: {
              type: 'string',
              format: 'uuid',
              description: 'Sales person user ID',
            },
            constructionPersonId: {
              type: 'string',
              format: 'uuid',
              nullable: true,
              description: 'Construction person user ID',
            },
            siteAddress: {
              type: 'string',
              maxLength: 500,
              nullable: true,
              description: 'Site address',
            },
            description: {
              type: 'string',
              maxLength: 2000,
              nullable: true,
              description: 'Project description',
            },
            expectedUpdatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Expected updatedAt for optimistic locking',
            },
          },
        },
        StatusHistory: {
          type: 'object',
          description: 'Project status change history entry',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'History entry ID',
            },
            projectId: {
              type: 'string',
              format: 'uuid',
              description: 'Project ID',
            },
            fromStatus: {
              type: 'string',
              nullable: true,
              description: 'Previous status (null for initial)',
            },
            toStatus: {
              type: 'string',
              description: 'New status',
            },
            transitionType: {
              $ref: '#/components/schemas/TransitionType',
            },
            reason: {
              type: 'string',
              nullable: true,
              description: 'Reason for transition (required for backward)',
            },
            changedById: {
              type: 'string',
              format: 'uuid',
              description: 'User who made the change',
            },
            changedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Timestamp of the change',
            },
            changedBy: {
              $ref: '#/components/schemas/UserRef',
            },
          },
        },
      },
      responses: {
        BadRequest: {
          description: 'Bad Request - Invalid parameters',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  error: {
                    type: 'string',
                  },
                  code: {
                    type: 'string',
                  },
                  details: {
                    type: 'object',
                  },
                },
              },
            },
          },
        },
        Unauthorized: {
          description: 'Unauthorized - Authentication required',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  error: {
                    type: 'string',
                  },
                },
              },
            },
          },
        },
        Forbidden: {
          description: 'Forbidden - Insufficient permissions',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  error: {
                    type: 'string',
                  },
                },
              },
            },
          },
        },
        NotFound: {
          description: 'Not Found',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  error: {
                    type: 'string',
                  },
                },
              },
            },
          },
        },
        InternalServerError: {
          description: 'Internal Server Error',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  error: {
                    type: 'string',
                  },
                  requestId: {
                    type: 'string',
                  },
                },
              },
            },
          },
        },
        Conflict: {
          description: 'Conflict - Resource was modified by another user (optimistic locking)',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  type: {
                    type: 'string',
                    description: 'Problem type URI',
                  },
                  title: {
                    type: 'string',
                    description: 'Problem title',
                    example: 'Conflict',
                  },
                  status: {
                    type: 'integer',
                    description: 'HTTP status code',
                    example: 409,
                  },
                  detail: {
                    type: 'string',
                    description: 'Detailed error message',
                  },
                  code: {
                    type: 'string',
                    description: 'Error code',
                    example: 'PROJECT_CONFLICT',
                  },
                  expectedUpdatedAt: {
                    type: 'string',
                    format: 'date-time',
                    description: 'Expected updatedAt timestamp',
                  },
                  actualUpdatedAt: {
                    type: 'string',
                    format: 'date-time',
                    description: 'Actual updatedAt timestamp',
                  },
                },
              },
            },
          },
        },
        UnprocessableEntity: {
          description: 'Unprocessable Entity - Invalid status transition or missing required data',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  type: {
                    type: 'string',
                    description: 'Problem type URI',
                  },
                  title: {
                    type: 'string',
                    description: 'Problem title',
                    example: 'Invalid Status Transition',
                  },
                  status: {
                    type: 'integer',
                    description: 'HTTP status code',
                    example: 422,
                  },
                  detail: {
                    type: 'string',
                    description: 'Detailed error message',
                  },
                  code: {
                    type: 'string',
                    description: 'Error code',
                    example: 'INVALID_STATUS_TRANSITION',
                  },
                  fromStatus: {
                    type: 'string',
                    description: 'Current status',
                  },
                  toStatus: {
                    type: 'string',
                    description: 'Requested status',
                  },
                  allowed: {
                    type: 'array',
                    items: {
                      type: 'string',
                    },
                    description: 'List of allowed transitions',
                  },
                },
              },
            },
          },
        },
      },
    },
    tags: [
      {
        name: 'Health',
        description: 'Health check endpoints',
      },
      {
        name: 'Admin',
        description: 'Administrative endpoints',
      },
      {
        name: 'Authentication',
        description: 'User authentication endpoints (register, login, logout, token refresh)',
      },
      {
        name: 'Two-Factor Authentication',
        description: '2FA setup, verification, and backup code management',
      },
      {
        name: 'Password Management',
        description: 'Password reset and recovery endpoints',
      },
      {
        name: 'Roles',
        description: 'Role management endpoints (RBAC)',
      },
      {
        name: 'Permissions',
        description: 'Permission management endpoints (RBAC)',
      },
      {
        name: 'Users',
        description: 'User management endpoints',
      },
      {
        name: 'Invitations',
        description: 'User invitation and onboarding endpoints',
      },
      {
        name: 'Audit Logs',
        description: 'System audit log endpoints',
      },
      {
        name: 'Projects',
        description: 'Project management endpoints',
      },
    ],
  },
  apis: ['./src/app.ts', './src/routes/**/*.ts'],
};

const specs = swaggerJsdoc(options);
const outputPath = `${__dirname}/../docs/api-spec.json`;
const outputDir = dirname(outputPath);

// Ensure the output directory exists
mkdirSync(outputDir, { recursive: true });

writeFileSync(outputPath, JSON.stringify(specs, null, 2));
console.log(`Swagger spec generated at ${outputPath}`);
