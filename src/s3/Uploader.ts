import axios from "axios"

interface UploaderOptions {
    chunkSize?: number;
    threadsQuantity?: number;
    file: File;
    fileName: string;
    sessionToken?: string;
}

// initializing axios
const api = axios.create({
    // baseURL: "http://localhost:1337",
    baseURL: "https://zoomy.b4a.io",
})

export class Uploader {
    private chunkSize: number;
    private threadsQuantity: number;
    private file: File;
    private fileName: string;
    private aborted: boolean;
    private uploadedSize: number;
    private progressCache: Record<string, any>;
    private activeConnections: Record<string, any>;
    private parts: any[];
    private uploadedParts: any[];
    private fileId: string | null;
    private fileKey: string | null;
    private sessionToken: string | null;
    private onProgressFn: (arg?: any) => void;
    private onErrorFn: (error?: any) => void;

    constructor(options: UploaderOptions) {

        this.sessionToken = options.sessionToken || null;

        // this must be bigger than or equal to 5MB,
        // otherwise AWS will respond with:
        // "Your proposed upload is smaller than the minimum allowed size"
        // Set the chunk size for each upload part, must be at least 5MB to comply with AWS requirements
        this.chunkSize = options.chunkSize || 1024 * 1024 * 5;

        // Set the number of parallel uploads, with a maximum of 15
        this.threadsQuantity = Math.min(options.threadsQuantity || 5, 15);

        // Store the file to be uploaded
        this.file = options.file;

        // Store the name of the file to be uploaded
        this.fileName = options.fileName;

        // Flag to indicate if the upload has been aborted
        this.aborted = false;

        // Track the total size of the uploaded parts
        this.uploadedSize = 0;

        // Cache for tracking upload progress
        this.progressCache = {};

        // Track active connections for parallel uploads
        this.activeConnections = {};

        // Array to store the parts of the file to be uploaded
        this.parts = [];

        // Array to store the parts that have been successfully uploaded
        this.uploadedParts = [];

        // Unique identifier for the file upload session
        this.fileId = null;

        // Key for the file in the storage service
        this.fileKey = null;

        // Callback function for upload progress updates
        this.onProgressFn = () => { };

        // Callback function for handling errors during upload
        this.onErrorFn = (error?: any) => { };
    }

    // starting the multipart upload request
    start() {
        this.initialize()
    }

    /**
     * Initializes the multipart upload process.
     * 
     * This method performs the following steps:
     * 1. Adds the file extension to the file name if present.
     * 2. Initializes the multipart upload request by sending the file name to the server.
     * 3. Retrieves the file ID and file key from the server response.
     * 4. Calculates the number of parts the file will be divided into based on the chunk size.
     * 5. Requests pre-signed URLs for each part from the server.
     * 6. Stores the pre-signed URLs and initiates the upload process.
     * 
     * @throws Will call the `complete` method with an error if any step fails.
     */
    async initialize() {
        try {
            // Step 1: Add the file extension (if present) to fileName
            let fileName = this.fileName
            const ext = this.file.name.split(".").pop()
            if (ext) {
                fileName += `.${ext}`
            }

            // Step 2: Initialize the multipart upload request
            const videoInitializationUploadInput = {
                name: fileName,
            }
            const initializeReponse = await api.request({
                url: "/uploads/initializeMultipartUpload",
                method: "POST",
                data: videoInitializationUploadInput,
            })

            // Step 3: Retrieve the file ID and file key from the server response
            const AWSFileDataOutput = initializeReponse.data
            this.fileId = AWSFileDataOutput.fileId
            this.fileKey = AWSFileDataOutput.fileKey

            // Step 4: Calculate the number of parts the file will be divided into
            const numberOfparts = Math.ceil(this.file.size / this.chunkSize)

            // Step 5: Request pre-signed URLs for each part from the server
            const AWSMultipartFileDataInput = {
                fileId: this.fileId,
                fileKey: this.fileKey,
                parts: numberOfparts,
            }
            const urlsResponse = await api.request({
                url: "/uploads/getMultipartPreSignedUrls",
                method: "POST",
                data: AWSMultipartFileDataInput,
            })

            // Step 6: Store the pre-signed URLs and initiate the upload process
            const newParts = urlsResponse.data.parts
            this.parts.push(...newParts)

            // Start sending the next part
            this.sendNext()
        } catch (error) {
            // Handle any errors by calling the complete method with the error
            await this.complete(error)
        }
    }

    /**
     * Manages the upload process by sending the next chunk of the file.
     * 
     * This method checks the number of active connections and compares it with the allowed
     * number of threads. If the number of active connections is less than the allowed threads,
     * it proceeds to send the next part of the file.
     * 
     * If there are no more parts to send and no active connections, it calls the `complete` method.
     * 
     * The method pops the next part from the `parts` array and calculates the chunk to be sent
     * based on the part number and chunk size. It then initiates the sending of the chunk.
     * 
     * If the chunk is successfully sent, it recursively calls itself to send the next chunk.
     * If there is an error during the sending process, it pushes the part back to the `parts` array
     * and calls the `complete` method with the error.
     * 
     * @private
     */
    sendNext() {
        // Get the number of active connections
        const activeConnections = Object.keys(this.activeConnections).length

        // If the number of active connections is greater than or equal to the allowed threads, return
        if (activeConnections >= this.threadsQuantity) {
            return;
        }

        // If there are no more parts to send
        if (!this.parts.length) {
            // If there are no active connections, call the complete method
            if (!activeConnections) {
                this.complete()
            }

            return;
        }

        // Pop the next part from the parts array
        const part = this.parts.pop()
        if (this.file && part) {
            // Calculate the size of the chunk to be sent
            const sentSize = (part.PartNumber - 1) * this.chunkSize
            // Slice the file to get the chunk
            const chunk = this.file.slice(sentSize, sentSize + this.chunkSize)

            // Define a callback function to be called when the chunk sending starts
            const sendChunkStarted = () => {
                this.sendNext()
            }

            // Send the chunk
            this.sendChunk(chunk, part, sendChunkStarted)
                .then(() => {
                    // If the chunk is successfully sent, recursively call sendNext to send the next chunk
                    this.sendNext()
                })
                .catch((error) => {
                    // If there is an error, push the part back to the parts array
                    this.parts.push(part)

                    // Call the complete method with the error
                    this.complete(error)
                })
        }
    }

    /**
     * Completes the upload process by sending a complete request.
     * If an error occurs and the upload has not been aborted, it triggers the error handler.
     * 
     * @param error - Optional error object that may have occurred during the upload process.
     * @returns A promise that resolves when the complete request is successfully sent, or rejects if an error occurs.
     */
    async complete(error?: any) {
        if (error && !this.aborted) {
            this.onErrorFn(error)
            return
        }

        if (error) {
            this.onErrorFn(error)
            return
        }

        try {
            await this.sendCompleteRequest()
        } catch (error) {
            this.onErrorFn(error)
        }
    }

    /**
     * Sends a request to finalize a multipart upload.
     * 
     * This method constructs a `videoFinalizationMultiPartInput` object containing
     * the `fileId`, `fileKey`, and `uploadedParts`, and sends a POST request to the
     * `/uploads/finalizeMultipartUpload` endpoint to complete the upload process.
     * 
     * @returns {Promise<void>} A promise that resolves when the request is complete.
     */
    async sendCompleteRequest() {
        if (this.fileId && this.fileKey) {
            const videoFinalizationMultiPartInput = {
                fileId: this.fileId,
                fileKey: this.fileKey,
                parts: this.uploadedParts,
            }

            try {
                await api.request({
                    url: "/uploads/finalizeMultipartUpload",
                    method: "POST",
                    data: videoFinalizationMultiPartInput,
                    headers: {
                        "parse-session-token": this.sessionToken,
                    },
                });
            } catch (error) {
                console.error("Failed to finalize multipart upload:", error);
                // Optionally, rethrow the error or handle it as needed
                // throw error;
            }
        }
    }

    /**
     * Sends a chunk of data to a specified signed URL.
     *
     * @param chunk - The data chunk to be uploaded.
     * @param part - An object containing the part number and the signed URL for the upload.
     * @param sendChunkStarted - A callback function that is called when the chunk upload starts.
     * @returns A promise that resolves when the chunk is successfully uploaded, or rejects with an error if the upload fails.
     */
    sendChunk(chunk: Blob, part: { PartNumber: number; signedUrl: string }, sendChunkStarted: () => void) {
        return new Promise<void>((resolve, reject) => {
            this.upload(chunk, part, sendChunkStarted)
                .then((status) => {
                    if (status !== 200) {
                        reject(new Error("Failed chunk upload"))
                        return
                    }

                    resolve()
                })
                .catch((error) => {
                    reject(error)
                })
        });
    }

    /**
     * Handles the progress of a file upload by updating the progress cache and calculating the upload percentage.
     * 
     * @param part - The part number of the file being uploaded.
     * @param event - The progress event containing information about the upload progress.
     * 
     * The method updates the progress cache based on the event type (progress, error, abort, uploaded).
     * It calculates the total uploaded size and the percentage of the file that has been uploaded.
     * Finally, it calls the `onProgressFn` callback with the current upload status.
     */
    handleProgress(part: number, event: ProgressEvent) {
        if (this.file) {
            // Update the progress cache based on the event type
            if (event.type === "progress" || event.type === "error" || event.type === "abort") {
                this.progressCache[part] = event.loaded; // Store the loaded bytes for the current part
            }

            // If the part is fully uploaded, update the uploaded size and remove it from the cache
            if (event.type === "uploaded") {
                this.uploadedSize += this.progressCache[part] || 0; // Add the loaded bytes to the total uploaded size
                delete this.progressCache[part]; // Remove the part from the progress cache
            }

            // Calculate the total bytes currently in progress
            const inProgress = Object.keys(this.progressCache)
                .map(Number)
                .reduce((memo, id) => (memo += this.progressCache[id]), 0);

            // Calculate the total bytes sent so far
            const sent = Math.min(this.uploadedSize + inProgress, this.file.size);

            // Get the total size of the file
            const total = this.file.size;

            // Calculate the upload percentage
            const percentage = Math.round((sent / total) * 100);

            // Call the onProgressFn callback with the current upload status
            this.onProgressFn({
                sent: sent,
                total: total,
                percentage: percentage,
            });
        }
    }

    /**
     * Uploads a file part to an S3 bucket using a pre-signed URL.
     *
     * @param {Blob} file - The file part to be uploaded.
     * @param {Object} part - An object containing the part number and the pre-signed URL.
     * @param {number} part.PartNumber - The part number of the file part.
     * @param {string} part.signedUrl - The pre-signed URL for the file part.
     * @param {Function} sendChunkStarted - A callback function to notify that the chunk upload has started.
     * @returns {Promise<number>} A promise that resolves with the status code of the upload request.
     */
    upload(file: Blob, part: { PartNumber: number; signedUrl: string }, sendChunkStarted: () => void): Promise<number> {
        return new Promise((resolve, reject) => {
            if (this.fileId && this.fileKey) {
                // Create FormData for the chunk
                const formData = new FormData();
                formData.append('chunk', file);

                const xhr = api.request({
                    method: 'POST',
                    url: `/uploads/proxy-upload-part?partNumber=${part.PartNumber}&uploadId=${this.fileId}&fileKey=${this.fileKey}`,
                    data: formData,
                    headers: {
                        'Content-Type': 'multipart/form-data'
                    },
                    onUploadProgress: (progressEvent) => {
                        this.handleProgress(part.PartNumber - 1, {
                            type: 'progress',
                            loaded: progressEvent.loaded,
                            total: progressEvent.total || 0
                        } as any);
                    }
                });

                // Store the cancel token
                this.activeConnections[part.PartNumber - 1] = xhr;

                // Notify that chunk upload started
                sendChunkStarted();

                xhr.then((response) => {
                    if (response.status === 200 && response.data.ETag) {
                        // Add the uploaded part to the list
                        this.uploadedParts.push({
                            PartNumber: part.PartNumber,
                            ETag: response.data.ETag
                        });

                        // Trigger progress event for completion
                        this.handleProgress(part.PartNumber - 1, {
                            type: 'uploaded',
                            loaded: file.size,
                            total: file.size
                        } as any);

                        resolve(response.status);
                    } else {
                        reject(new Error('Failed to upload chunk'));
                    }
                    delete this.activeConnections[part.PartNumber - 1];
                }).catch((error) => {
                    reject(error);
                    delete this.activeConnections[part.PartNumber - 1];
                });
            }
        });
    }

    /**
     * Registers a callback function to be called during the upload process to report progress.
     *
     * @param onProgress - A callback function that will be invoked with progress updates.
     * @returns The current instance of the uploader for method chaining.
     */
    onProgress(onProgress: any) {
        this.onProgressFn = onProgress
        return this
    }

    /**
     * Registers a callback function to be executed when an error occurs.
     *
     * @param onError - The callback function to handle errors.
     * @returns The current instance of the class for method chaining.
     */
    onError(onError: any) {
        this.onErrorFn = onError
        return this
    }

    /**
     * Aborts all active connections and sets the aborted flag to true.
     * 
     * This method iterates over all active connections, calling the `abort` method
     * on each one to terminate the connection. After all connections have been aborted,
     * it sets the `aborted` property to true to indicate that the abort process has been completed.
     */
    abort() {
        Object.keys(this.activeConnections)
            .map(Number)
            .forEach((id) => {
                this.activeConnections[id].abort()
            })

        this.aborted = true
    }
}