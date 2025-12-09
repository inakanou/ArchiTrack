/**
 * @fileoverview OpenAPI仕様書の完全性テスト
 *
 * Requirements:
 * - 14.7: OpenAPI仕様書の更新（新規エンドポイントをSwagger仕様に反映）
 *
 * TDD: RED phase - テストを先に作成
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// OpenAPI仕様書を読み込み
const apiSpecPath = resolve(__dirname, '../../../../docs/api-spec.json');
const apiSpec = JSON.parse(readFileSync(apiSpecPath, 'utf-8'));

describe('OpenAPI Specification - Project Management', () => {
  describe('Tags', () => {
    it('should include Projects tag', () => {
      const projectsTag = apiSpec.tags?.find((tag: { name: string }) => tag.name === 'Projects');
      expect(projectsTag).toBeDefined();
      expect(projectsTag.description).toBe('Project management endpoints');
    });
  });

  describe('Components/Schemas', () => {
    it('should define ProjectInfo schema', () => {
      const schema = apiSpec.components?.schemas?.ProjectInfo;
      expect(schema).toBeDefined();
      expect(schema.type).toBe('object');
      expect(schema.properties).toHaveProperty('id');
      expect(schema.properties).toHaveProperty('name');
      expect(schema.properties).toHaveProperty('customerName');
      expect(schema.properties).toHaveProperty('salesPerson');
      expect(schema.properties).toHaveProperty('constructionPerson');
      expect(schema.properties).toHaveProperty('siteAddress');
      expect(schema.properties).toHaveProperty('description');
      expect(schema.properties).toHaveProperty('status');
      expect(schema.properties).toHaveProperty('statusLabel');
      expect(schema.properties).toHaveProperty('createdAt');
      expect(schema.properties).toHaveProperty('updatedAt');
    });

    it('should define ProjectDetail schema', () => {
      const schema = apiSpec.components?.schemas?.ProjectDetail;
      expect(schema).toBeDefined();
      expect(schema.type).toBe('object');
      // ProjectDetail uses allOf to extend ProjectInfo
      expect(schema.allOf).toBeDefined();
      expect(schema.allOf).toHaveLength(2);
      // Check that it references ProjectInfo
      expect(schema.allOf[0].$ref).toBe('#/components/schemas/ProjectInfo');
      // Check that createdBy is in the extended properties
      expect(schema.allOf[1].properties).toHaveProperty('createdBy');
    });

    it('should define CreateProjectRequest schema', () => {
      const schema = apiSpec.components?.schemas?.CreateProjectRequest;
      expect(schema).toBeDefined();
      expect(schema.type).toBe('object');
      expect(schema.required).toContain('name');
      expect(schema.required).toContain('customerName');
      expect(schema.required).toContain('salesPersonId');
      expect(schema.properties).toHaveProperty('name');
      expect(schema.properties).toHaveProperty('customerName');
      expect(schema.properties).toHaveProperty('salesPersonId');
      expect(schema.properties).toHaveProperty('constructionPersonId');
      expect(schema.properties).toHaveProperty('siteAddress');
      expect(schema.properties).toHaveProperty('description');
    });

    it('should define UpdateProjectRequest schema', () => {
      const schema = apiSpec.components?.schemas?.UpdateProjectRequest;
      expect(schema).toBeDefined();
      expect(schema.type).toBe('object');
      expect(schema.required).toContain('expectedUpdatedAt');
      expect(schema.properties).toHaveProperty('name');
      expect(schema.properties).toHaveProperty('customerName');
      expect(schema.properties).toHaveProperty('salesPersonId');
      expect(schema.properties).toHaveProperty('constructionPersonId');
      expect(schema.properties).toHaveProperty('siteAddress');
      expect(schema.properties).toHaveProperty('description');
      expect(schema.properties).toHaveProperty('expectedUpdatedAt');
    });

    it('should define PaginationInfo schema', () => {
      const schema = apiSpec.components?.schemas?.PaginationInfo;
      expect(schema).toBeDefined();
      expect(schema.type).toBe('object');
      expect(schema.properties).toHaveProperty('page');
      expect(schema.properties).toHaveProperty('limit');
      expect(schema.properties).toHaveProperty('total');
      expect(schema.properties).toHaveProperty('totalPages');
    });

    it('should define UserRef schema', () => {
      const schema = apiSpec.components?.schemas?.UserRef;
      expect(schema).toBeDefined();
      expect(schema.type).toBe('object');
      expect(schema.properties).toHaveProperty('id');
      expect(schema.properties).toHaveProperty('displayName');
    });

    it('should define ProjectStatus enum', () => {
      const schema = apiSpec.components?.schemas?.ProjectStatus;
      expect(schema).toBeDefined();
      expect(schema.type).toBe('string');
      expect(schema.enum).toContain('PREPARING');
      expect(schema.enum).toContain('SURVEYING');
      expect(schema.enum).toContain('ESTIMATING');
      expect(schema.enum).toContain('APPROVING');
      expect(schema.enum).toContain('CONTRACTING');
      expect(schema.enum).toContain('CONSTRUCTING');
      expect(schema.enum).toContain('DELIVERING');
      expect(schema.enum).toContain('BILLING');
      expect(schema.enum).toContain('AWAITING');
      expect(schema.enum).toContain('COMPLETED');
      expect(schema.enum).toContain('CANCELLED');
      expect(schema.enum).toContain('LOST');
    });

    it('should define StatusHistory schema', () => {
      const schema = apiSpec.components?.schemas?.StatusHistory;
      expect(schema).toBeDefined();
      expect(schema.type).toBe('object');
      expect(schema.properties).toHaveProperty('id');
      expect(schema.properties).toHaveProperty('projectId');
      expect(schema.properties).toHaveProperty('fromStatus');
      expect(schema.properties).toHaveProperty('toStatus');
      expect(schema.properties).toHaveProperty('transitionType');
      expect(schema.properties).toHaveProperty('reason');
      expect(schema.properties).toHaveProperty('changedById');
      expect(schema.properties).toHaveProperty('changedAt');
      expect(schema.properties).toHaveProperty('changedBy');
    });

    it('should define TransitionType enum', () => {
      const schema = apiSpec.components?.schemas?.TransitionType;
      expect(schema).toBeDefined();
      expect(schema.type).toBe('string');
      expect(schema.enum).toContain('initial');
      expect(schema.enum).toContain('forward');
      expect(schema.enum).toContain('backward');
      expect(schema.enum).toContain('terminate');
    });
  });

  describe('Components/Responses', () => {
    it('should define Conflict response (409)', () => {
      const response = apiSpec.components?.responses?.Conflict;
      expect(response).toBeDefined();
      expect(response.description).toContain('Conflict');
      expect(response.content['application/json'].schema.properties).toHaveProperty('type');
      expect(response.content['application/json'].schema.properties).toHaveProperty('title');
      expect(response.content['application/json'].schema.properties).toHaveProperty('status');
      expect(response.content['application/json'].schema.properties).toHaveProperty('detail');
      expect(response.content['application/json'].schema.properties).toHaveProperty('code');
    });

    it('should define UnprocessableEntity response (422)', () => {
      const response = apiSpec.components?.responses?.UnprocessableEntity;
      expect(response).toBeDefined();
      expect(response.description).toContain('Unprocessable');
      expect(response.content['application/json'].schema.properties).toHaveProperty('type');
      expect(response.content['application/json'].schema.properties).toHaveProperty('title');
      expect(response.content['application/json'].schema.properties).toHaveProperty('status');
      expect(response.content['application/json'].schema.properties).toHaveProperty('detail');
      expect(response.content['application/json'].schema.properties).toHaveProperty('code');
    });
  });

  describe('Paths - /api/projects', () => {
    it('should define GET /api/projects endpoint', () => {
      const endpoint = apiSpec.paths['/api/projects']?.get;
      expect(endpoint).toBeDefined();
      expect(endpoint.tags).toContain('Projects');
      expect(endpoint.summary).toBeDefined();
      expect(endpoint.security).toEqual([{ bearerAuth: [] }]);

      // Query parameters
      const paramNames = endpoint.parameters?.map((p: { name: string }) => p.name) || [];
      expect(paramNames).toContain('page');
      expect(paramNames).toContain('limit');
      expect(paramNames).toContain('search');
      expect(paramNames).toContain('status');
      expect(paramNames).toContain('createdFrom');
      expect(paramNames).toContain('createdTo');
      expect(paramNames).toContain('sort');
      expect(paramNames).toContain('order');

      // Responses
      expect(endpoint.responses['200']).toBeDefined();
      expect(endpoint.responses['400']).toBeDefined();
      expect(endpoint.responses['401']).toBeDefined();
      expect(endpoint.responses['403']).toBeDefined();
    });

    it('should define POST /api/projects endpoint', () => {
      const endpoint = apiSpec.paths['/api/projects']?.post;
      expect(endpoint).toBeDefined();
      expect(endpoint.tags).toContain('Projects');
      expect(endpoint.summary).toBeDefined();
      expect(endpoint.security).toEqual([{ bearerAuth: [] }]);

      // Request body should reference CreateProjectRequest schema
      expect(endpoint.requestBody?.content['application/json'].schema.$ref).toBe(
        '#/components/schemas/CreateProjectRequest'
      );

      // Responses
      expect(endpoint.responses['201']).toBeDefined();
      expect(endpoint.responses['400']).toBeDefined();
      expect(endpoint.responses['401']).toBeDefined();
      expect(endpoint.responses['403']).toBeDefined();
    });
  });

  describe('Paths - /api/projects/{id}', () => {
    it('should define GET /api/projects/{id} endpoint', () => {
      const endpoint = apiSpec.paths['/api/projects/{id}']?.get;
      expect(endpoint).toBeDefined();
      expect(endpoint.tags).toContain('Projects');
      expect(endpoint.security).toEqual([{ bearerAuth: [] }]);

      // Path parameter
      const idParam = endpoint.parameters?.find((p: { name: string }) => p.name === 'id');
      expect(idParam).toBeDefined();
      expect(idParam.in).toBe('path');
      expect(idParam.required).toBe(true);
      expect(idParam.schema.format).toBe('uuid');

      // Responses
      expect(endpoint.responses['200']).toBeDefined();
      expect(endpoint.responses['400']).toBeDefined();
      expect(endpoint.responses['401']).toBeDefined();
      expect(endpoint.responses['403']).toBeDefined();
      expect(endpoint.responses['404']).toBeDefined();
    });

    it('should define PUT /api/projects/{id} endpoint', () => {
      const endpoint = apiSpec.paths['/api/projects/{id}']?.put;
      expect(endpoint).toBeDefined();
      expect(endpoint.tags).toContain('Projects');
      expect(endpoint.security).toEqual([{ bearerAuth: [] }]);

      // Request body should reference UpdateProjectRequest schema
      expect(endpoint.requestBody?.content['application/json'].schema.$ref).toBe(
        '#/components/schemas/UpdateProjectRequest'
      );

      // Responses including 409 for conflict
      expect(endpoint.responses['200']).toBeDefined();
      expect(endpoint.responses['400']).toBeDefined();
      expect(endpoint.responses['401']).toBeDefined();
      expect(endpoint.responses['403']).toBeDefined();
      expect(endpoint.responses['404']).toBeDefined();
      expect(endpoint.responses['409']).toBeDefined();
    });

    it('should define DELETE /api/projects/{id} endpoint', () => {
      const endpoint = apiSpec.paths['/api/projects/{id}']?.delete;
      expect(endpoint).toBeDefined();
      expect(endpoint.tags).toContain('Projects');
      expect(endpoint.security).toEqual([{ bearerAuth: [] }]);

      // Responses
      expect(endpoint.responses['204']).toBeDefined();
      expect(endpoint.responses['400']).toBeDefined();
      expect(endpoint.responses['401']).toBeDefined();
      expect(endpoint.responses['403']).toBeDefined();
      expect(endpoint.responses['404']).toBeDefined();
    });
  });

  describe('Paths - /api/projects/{id}/status', () => {
    it('should define PATCH /api/projects/{id}/status endpoint', () => {
      const endpoint = apiSpec.paths['/api/projects/{id}/status']?.patch;
      expect(endpoint).toBeDefined();
      expect(endpoint.tags).toContain('Projects');
      expect(endpoint.security).toEqual([{ bearerAuth: [] }]);

      // Request body
      const bodySchema = endpoint.requestBody?.content['application/json'].schema;
      expect(bodySchema.required).toContain('status');
      expect(bodySchema.properties.status.enum).toBeDefined();
      expect(bodySchema.properties.reason).toBeDefined();

      // Responses including 422 for invalid transition
      expect(endpoint.responses['200']).toBeDefined();
      expect(endpoint.responses['400']).toBeDefined();
      expect(endpoint.responses['401']).toBeDefined();
      expect(endpoint.responses['403']).toBeDefined();
      expect(endpoint.responses['404']).toBeDefined();
      expect(endpoint.responses['422']).toBeDefined();
    });
  });

  describe('Paths - /api/projects/{id}/status-history', () => {
    it('should define GET /api/projects/{id}/status-history endpoint', () => {
      const endpoint = apiSpec.paths['/api/projects/{id}/status-history']?.get;
      expect(endpoint).toBeDefined();
      expect(endpoint.tags).toContain('Projects');
      expect(endpoint.security).toEqual([{ bearerAuth: [] }]);

      // Path parameter
      const idParam = endpoint.parameters?.find((p: { name: string }) => p.name === 'id');
      expect(idParam).toBeDefined();
      expect(idParam.in).toBe('path');
      expect(idParam.required).toBe(true);

      // Responses
      expect(endpoint.responses['200']).toBeDefined();
      expect(endpoint.responses['400']).toBeDefined();
      expect(endpoint.responses['401']).toBeDefined();
      expect(endpoint.responses['403']).toBeDefined();
      expect(endpoint.responses['404']).toBeDefined();
    });
  });

  describe('Security definition', () => {
    it('should define bearerAuth security scheme', () => {
      const securityScheme = apiSpec.components?.securitySchemes?.BearerAuth;
      expect(securityScheme).toBeDefined();
      expect(securityScheme.type).toBe('http');
      expect(securityScheme.scheme).toBe('bearer');
      expect(securityScheme.bearerFormat).toBe('JWT');
    });
  });
});
