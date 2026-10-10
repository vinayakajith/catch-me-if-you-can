import { GetObjectCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand, DeleteObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { AssetStore } from '../contracts.ts';
import { MAX_UPLOAD_BYTES } from '../images.ts';
import { JobError } from '../jobs.ts';
export class S3Assets implements AssetStore {
  readonly client: S3Client; readonly bucket: string;
  constructor(bucket: string, client = new S3Client({ maxAttempts: 3 })) { this.bucket = bucket; this.client = client; }
  key(id: string, name?: string) {
    if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id) || (name && (!/^[a-z0-9][a-z0-9.-]*$/.test(name) || name.includes('..')))) throw new JobError(400, 'Invalid asset.');
    return `${id}/${name ?? ''}`;
  }
  async read(id: string, name: string, etag?: string) {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.key(id, name), IfMatch: etag }));
    if (!response.Body) throw new JobError(404, 'This image is no longer available.');
    return Buffer.from(await response.Body.transformToByteArray());
  }
  async write(id: string, name: string, data: Buffer) { await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: this.key(id, name), Body: data, ServerSideEncryption: 'AES256', ContentType: name.endsWith('.jpg') ? 'image/jpeg' : name.endsWith('.json') ? 'application/json' : 'image/png', CacheControl: 'private, no-store' })); }
  async remove(id: string, name?: string) {
    if (name) { await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.key(id, name) })); return; }
    let token: string | undefined;
    do {
      const page = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: this.key(id), ContinuationToken: token }));
      if (page.Contents?.length) {
        const result = await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: page.Contents.map(object => ({ Key: object.Key! })), Quiet: true } }));
        if (result.Errors?.length) throw new Error('Some private assets could not be deleted. Cleanup must retry.');
      }
      token = page.NextContinuationToken;
    } while (token);
  }
  async url(id: string, name: string, expiresAt: number) { return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: this.key(id, name), ResponseCacheControl: 'private, no-store' }), { expiresIn: Math.max(1, Math.min(60, Math.floor((expiresAt - Date.now()) / 1000))) }); }
  async upload(id: string) { return createPresignedPost(this.client, { Bucket: this.bucket, Key: this.key(id, 'upload.jpg'), Expires: 300, Fields: { 'Content-Type': 'image/jpeg', 'x-amz-server-side-encryption': 'AES256' }, Conditions: [['content-length-range', 1, MAX_UPLOAD_BYTES], ['eq', '$Content-Type', 'image/jpeg'], ['eq', '$x-amz-server-side-encryption', 'AES256']] }); }
  async uploaded(id: string) {
    let object;
    try { object = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: this.key(id, 'upload.jpg') })); }
    catch (error) { if (['NotFound', 'NoSuchKey'].includes((error as Error).name)) throw new JobError(404, 'The photo did not finish uploading. Choose it again; no image has been generated.'); throw error; }
    if (!object.ETag || !object.ContentLength || object.ContentLength > MAX_UPLOAD_BYTES || object.ContentType !== 'image/jpeg') throw new JobError(400, 'Upload one portrait under 10 MB.');
    return object.ETag;
  }
}
