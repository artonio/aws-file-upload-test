// const fileCopy: any = file();
//       console.log('File:', file());
//       // convert file to buffer
//       const reader = new FileReader();
//       reader.onload = () => {
//         const buffer = reader.result as ArrayBuffer;
//         const base64String = btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
//       };
//       reader.readAsArrayBuffer(file()!);

// parse!.cloud.run('antonDebugTest', {useMasterKey: true})
// .then((result) => {
//   console.log('Cloud function result:', result);
// }).catch((error) => {
//   console.error('Cloud function error:', error);
// });

// const upload = new tus.Upload(fileCopy, {
//     // Endpoint is the upload creation URL from your tus server
//     // endpoint: 'http://localhost:1337/tus-upload',
//     endpoint: 'https://zoomy.b4a.io/tus-upload',
//     // Retry delays will enable tus-js-client to automatically retry on errors
//     retryDelays: [0, 3000, 5000, 10000, 20000],
//     // Attach additional meta data about the file for the server
//     metadata: {
//         filename: fileCopy.name,
//         filetype: fileCopy.type,
//     },
//     // Callback for errors which cannot be fixed using retries
//     onError: (error) => {
//         console.log('Failed because: ' + error)
//     },
//     // Callback for reporting upload progress
//     onProgress: (bytesUploaded, bytesTotal) => {
//         var percentage = ((bytesUploaded / bytesTotal) * 100).toFixed(2)
//         console.log(bytesUploaded, bytesTotal, percentage + '%')
//     },
//     // Callback for once the upload is completed
//     onSuccess: () => {
//         // console.log('Download %s from %s', upload.fileCopy.name, upload.url)
//     },
// })

// // Check if there are any previous uploads to continue.
// upload.findPreviousUploads().then(function (previousUploads) {
//     // Found previous uploads so we select the first one.
//     if (previousUploads.length) {
//         upload.resumeFromPreviousUpload(previousUploads[0])
//     }

//     // Start the upload
//     upload.start()
// })


// call cloud function
// parse!.cloud.run('uploadFileToS3', { file: base64String, fileName: file()?.name, fileType: file()?.type })
// .then((result) => {
//   console.log('Cloud function result:', result);
// }).catch((error) => {
//   console.error('Cloud function error:', error);
// });