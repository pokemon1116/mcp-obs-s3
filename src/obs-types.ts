/**
 * Type definitions for esdk-obs-nodejs (CJS, no @types available)
 */

export interface ObsClientConfig {
  access_key_id: string;
  secret_access_key: string;
  server: string;
  is_secure?: boolean;
  path_style?: boolean;
  signature?: string;
  region?: string;
  port?: number;
  max_retry_count?: number;
  timeout?: number;
  ssl_verify?: boolean;
  security_token?: string;
  max_connections?: number;
  user_agent?: string;
}

export interface ObsCommonMsg {
  Status: number;
  Code: string;
  Message: string;
}

export interface ObsObject {
  Key: string;
  Size: string;
  LastModified: string;
  ETag?: string;
  Owner?: { ID: string; DisplayName: string };
  StorageClass?: string;
}

export interface ObsResult {
  CommonMsg: ObsCommonMsg;
  InterfaceResult: {
    RequestId: string;
    Content?: Buffer | string;
    ETag?: string;
    UploadId?: string;
    Contents?: ObsObject[];
    Buckets?: Array<{ Name: string; CreateDate: string; Location?: string }>;
    [key: string]: unknown;
  };
}

export interface UploadFileParams {
  Bucket: string;
  Key: string;
  UploadFile: string;
  ContentType?: string;
  PartSize?: number;
  TaskNum?: number;
  EnableCheckpoint?: boolean;
  ACL?: string;
  Metadata?: Record<string, string>;
}

export interface DownloadFileParams {
  Bucket: string;
  Key: string;
  DownloadFile: string;
  PartSize?: number;
  TaskNum?: number;
  EnableCheckpoint?: boolean;
}

export interface ListObjectsParams {
  Bucket: string;
  Prefix?: string;
  MaxKeys?: number;
  Marker?: string;
  Delimiter?: string;
}

export interface SignedUrlParams {
  Method: string;
  Bucket: string;
  Key: string;
  Expires?: number;
  Headers?: Record<string, string>;
  SpecialParam?: string;
}

export type ObsCallback = (err: string | null, result: ObsResult) => void;

export interface ObsClient {
  new (config: ObsClientConfig): {
    uploadFile(params: UploadFileParams, callback: ObsCallback): void;
    downloadFile(params: DownloadFileParams, callback: ObsCallback): void;
    listObjects(params: ListObjectsParams): Promise<ObsResult>;
    putObject(params: {
      Bucket: string;
      Key: string;
      Body?: string | Buffer;
      SourceFile?: string;
      ContentType?: string;
      Metadata?: Record<string, string>;
    }): Promise<ObsResult>;
    getObject(params: {
      Bucket: string;
      Key: string;
      SaveAsFile?: string;
      Range?: string;
    }): Promise<ObsResult>;
    createSignedUrlSync(params: SignedUrlParams): {
      SignedUrl: string;
      ActualSignedRequestHeaders: Record<string, string>;
    };
    close(): void;
    enums: {
      AclPrivate: string;
      AclPublicRead: string;
      AclPublicReadWrite: string;
      StorageClassStandard: string;
      StorageClassWarm: string;
      StorageClassCold: string;
    };
  };
}
