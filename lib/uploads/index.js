var uploads = {};
const os = require('os');
const fs = require('fs');

var cleanup = function(uuid) {
    if(uploads.hasOwnProperty(uuid)) {
        if(uploads[uuid].files.length > 0) {
            let file = uploads[uuid].files.pop();
            fs.stat(file.file.filepath, function(err, stats) {
                if(err) {
                    //console.log('failed to find file for deletion during cleanup');
                    cleanup(uuid);
                    return;
                } else {
                    fs.unlink(file.file.filepath, function(err) {
                        if(err) {
                            console.log('failed to delete file during cleanup');
                            cleanup(uuid);
                            return;
                        } else {
                            cleanup(uuid);
                            return;
                        }
                    });
                }
            });
        } else {
            console.log('file deletion cleanup complete, deleting streamed file and object...');
            uploads[uuid].stream.end();
            fs.stat(uploads[uuid].originalFilename, function(err, stats) {
                if(err) {
                    console.log('failed to find streamed file during cleanup');
                    delete uploads[uuid];
                    return;
                } else {
                    fs.unlink(uploads[uuid].originalFilename, function(err) {
                        if(err) {
                            console.log('failed to delete streamed file during cleanup');
                            delete uploads[uuid];
                            return;
                        } else {
                            delete uploads[uuid];
                            return;
                        }
                    });
                }
            });
        }
    }
}

var houseKeeping = function() {
    setTimeout(function() {
        let keys = Object.keys(uploads)
        for(let i = 0; i < keys.length; i++) {
            let now = new Date();
            let lastchunkms = now - uploads[keys[i]].lastChunk;
            if(uploads[keys[i]].complete===true) {
                //file has been sitting around too long after completion, processing must have failed, cleanup upload after 30 minutes
                if(lastchunkms > 1 * 60 * 1000) {
                    console.log('upload completed, but processing failed');
                    //console.log(uploads[keys[i]]);
                    cleanup(keys[i]);
                }
            } else {
                //time between chunks is too long, cleanup upload after 5 minutes
                if(lastchunkms > 1 * 60 * 1000) {
                    //console.log('found upload failure');   
                    //console.log(uploads[keys[i]]);
                    cleanup(keys[i]);
                }
            }
            //console.log(uploads[keys].lastChunk);
        }
        //console.log(uploads);
        houseKeeping();
    }, 10000);
}

houseKeeping();

module.exports = {
    exists: function(uuid) {
        if(uploads.hasOwnProperty(uuid)) {
            return true;
        } else {
            return false;
        }
    },
    get: function(uuid) {
        if(uploads.hasOwnProperty(uuid)) {
            return uploads[uuid];
        } else {
            console.log('failed to get non-existent upload');
            return false;
        }
    },
    create: function(uuid, file) {
        if(uploads.hasOwnProperty(uuid)) {
            console.log('cannot create because upload already exists');
            return false;
        } else {
            let newfile = os.tmpdir() + '\\' + file.file.originalFilename;
            let stream = fs.createWriteStream(newfile);

            stream.on('end', function() {
                console.log('stream has ended');
            });

            stream.on('close', function() {
                console.log('stream has ended');
            });

            stream.on('error', function(err) {
                console.log('stream error');
                console.log(err);
            });

            uploads[uuid] = {
                files: [file],
                index: 0,
                busy: false,
                complete: false,
                originalFilename: newfile,
                lastChunk: new Date(),
                stream: stream,
                callback: false
            }

            return uploads[uuid];
        }
    },
    addFile: function(uuid, file, last) {
        if(uploads.hasOwnProperty(uuid)) {
            uploads[uuid].files.push(file);
            uploads[uuid].lastChunk = new Date();
            if(last) {
                //console.log('this was called!');
                uploads[uuid].complete = true;
                uploads[uuid].callback = last;
            }
            return true;
        } else {
            console.log('failed to add file because uuid doesn\'t exist');
            return false;
        }
    },
    finalize: function(uuid) {
        if(uploads.hasOwnProperty(uuid)) {
            uploads[uuid].stream.end();
            uploads[uuid].callback(false, uploads[uuid].originalFilename);
            delete uploads[uuid];
        } else {
            uploads[uuid].callback('file does not exist!', uploads[uuid].originalFilename);
            delete uploads[uuid];
            console.log('Cannot finalize non existent upload');
            return false;
        }
    }
}