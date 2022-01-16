var express = require('express');
var router = express.Router();
const formidable = require('formidable')
const os = require('os');
const fs = require('fs');
const uploads = require('../lib/uploads');
const ffmpeg_wrapper = require('node-ffmpeg-wrapper');
const languages = require('../lib/languages');

var encodings = {};

function checkProgress(uuid) {
  if(encodings.hasOwnProperty(uuid)) {
    encodings[uuid]
  }
}

/* GET home page. */
router.get('/progress/:uuid', function(req, res, next) {
  res.set('Cache-Control', 'public, max-age=0, no-cache');
  if(encodings.hasOwnProperty(req.params.uuid)) {
    let resp = {
      probe: encodings[req.params.uuid].probe,
      status: encodings[req.params.uuid].status,
      progress: encodings[req.params.uuid].progress,
      complete: encodings[req.params.uuid].complete,
      message: encodings[req.params.uuid].message,
      output: encodings[req.params.uuid].output
    }
    res.status(200).json({ uuid: req.params.uuid, encoding: resp });
    if(encodings[req.params.uuid].complete == true) {
      delete encodings[req.params.uuid];
    }
  } else {
    res.status(404).json({ uuid: req.params.uuid });
  }
});

router.post('/interrupt', function(req, res, next) {
  console.log(req.body);
  res.set('Cache-Control', 'public, max-age=0, no-cache');
  if(encodings.hasOwnProperty(req.body.uuid)) {
    res.status(200).json({ uuid: req.body.uuid, encoding: encodings[req.body.uuid] });
    //if(encodings[req.params.uuid].complete == true) {
      encodings[req.body.uuid].encoder.stop();
      //delete encodings[req.body.uuid];
    //}
  } else {
    res.status(404).json({ uuid: req.body.uuid });
  }
});

function processUpload(uuid) {
  if(uploads.exists(uuid)) {
    let upload = uploads.get(uuid);
    if(upload.busy===false) {
      if(upload.index < upload.files.length) {
        upload.busy = true;
        //console.log(upload.files[upload.index]);
        //console.log(upload.files[upload.index].file.filepath);
        fs.readFile(upload.files[upload.index].file.filepath, function(err, data) {
          if(err) {
            uploads.finalize(uuid);
            console.log(err);
            return;
          } else {
            //console.log(data);
            upload.stream.write(data, function(err) {
              if(err) {
                uploads.finalize(uuid);
                console.log(err);
                return;
              } else {
                fs.unlink(upload.files[upload.index].file.filepath, function(err) {
                  upload.busy = false;
                  if(err) {
                    console.log('failed to delete file ' + upload.files[upload.index].file.filepath);
                  } else {
                    console.log('deleted ' + upload.files[upload.index].file.filepath);
                    if(upload.index < upload.files.length) {
                      upload.index++;
                      //console.log('this happened');
                      processUpload(uuid);
                      return;
                    } else {
                      return;
                    }
                  }
                });
              }
            //console.log(upload.files[upload.index]);
            })
          }
        });
      } else {
        if(upload.complete===true) {
          //console.log('this should only happen at the end');
          uploads.finalize(uuid);
          //console.log(uploads);
          return;
        } else {
          console.log('getting ahead of myself...');
        }
        return;
      }
    } else {
      //console.log('upload is busy');
      return;
    }
  } else {
    console.log('failed to find upload ' + uuid);
    return;
  }
}

/* GET home page. */
router.get('/', function(req, res, next) {
  //console.log(languages.short());
  res.render('index', { title: 'Express', long: JSON.stringify(languages.long()), short: JSON.stringify(languages.short()) });
});

router.post('/uploadsub', function(req, res, next) {
  let dir = os.tmpdir();
  const form = new formidable.IncomingForm({ 
    uploadDir: dir,  // don't forget the __dirname here
    //keepExtensions: false
  })
  form.maxFileSize = 10 * 1024;
  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.log("Error parsing the files");
      return res.status(400).json({
        status: "Fail",
        message: "There was an error parsing the files",
        error: err,
      });
    } else {
      //console.log(fields);
      console.log(files);
      fs.rename(dir + '\\' + files.file.newFilename, dir + '\\' + files.file.originalFilename, function(err) {
        let ffmpeg = new ffmpeg_wrapper({bindir: 'C:\\ffmpeg\\bin'});
        ffmpeg.probe({in: [dir + '\\' + files.file.originalFilename]}, function(err, output) {
          if(err) {
            return res.status(500).json({
              status: "error",
              message: "ffprobe failed",
              //uploaduuid: fields.dzuuid,
              //data: output,
              error: err
            });
          } else {
            return res.status(201).json({
              status: "success",
              message: "File successfully uploaded",
              //uploaduuid: fields.dzuuid,
              data: output,
              error: err
            });
          }
        });
      });
    }
  });
});

router.post('/encode', function(req, res, next) {
  let ffmpeg = req.body;
  console.log(ffmpeg);
  let streamcount = {
    video: 0,
    audio: 0,
    subtitle: 0
  }
  let precmd = [];
  let cmd = [];
  let cmdmapping = [];
  //let cmdmapmetadata = [];
  let cmdencoding = [];
  let cmdmetadata = [];
  //cmd.push('-force_key_frames 00:00:00.500,00:00:01.000');
  if(ffmpeg.duration) {
    if(ffmpeg.duration.begin) {
      if(ffmpeg.mappings[0]['0:0'].action == 'copy') {
        precmd.push('-ss ' + ffmpeg.duration.begin);
      } else {
        cmd.push('-ss ' + ffmpeg.duration.begin);
      }
    }
    if(ffmpeg.duration.end) {
      cmd.push('-t ' + ffmpeg.duration.end);
    }
  }
  for (let i = 0; i < ffmpeg.mappings.length; i++) {
    let keys = Object.keys(ffmpeg.mappings[i]);
    for (let j = 0; j < keys.length; j++) {
      if(ffmpeg.mappings[i][keys[j]].hasOwnProperty('metadata')) {
        let metadata = [];
        let metakeys = Object.keys(ffmpeg.mappings[i][keys[j]]['metadata'])
        for (let k = 0; k < metakeys.length; k++) {
          cmdmetadata.push('-metadata:s:' + ffmpeg.mappings[i][keys[j]].type[0] + ':' + streamcount[ffmpeg.mappings[i][keys[j]].type] + ' ' + metakeys[k] + '=' + ffmpeg.mappings[i][keys[j]]['metadata'][metakeys[k]]);
        }
        //let splitkey = keys[j].split(':');
        //cmdmapmetadata.push('-map_metadata ' + splitkey[0] + ':' + ffmpeg.mappings[i][keys[j]].type[0] + ':' + streamcount[ffmpeg.mappings[i][keys[j]].type]);
        //cmdmetadata.push('-metadata:' + ffmpeg.mappings[i][keys[j]].type[0] + ':' + streamcount[ffmpeg.mappings[i][keys[j]].type] + ' ' + metadata.join(','));
      }
      cmdmapping.push('-map ' + keys[j]);
      cmdencoding.push('-c:' + ffmpeg.mappings[i][keys[j]].type[0] + ':' + streamcount[ffmpeg.mappings[i][keys[j]].type] + ' ' + ffmpeg.mappings[i][keys[j]].action);
      streamcount[ffmpeg.mappings[i][keys[j]].type]++;
      //console.log(ffmpeg.mappings[i][keys[j]]);
      //cmdencoding.push('-map ' + keys[j]);
    }

  }
  //console.log(ffmpeg);
  cmd.push(cmdmapping.join(' '));
  //cmd.push(cmdmapmetadata.join(' '));
  cmd.push(cmdmetadata.join(' '));
  cmd.push(cmdencoding.join(' '));

  //console.log(ffmpeg.inputs);
  console.log(cmd.join(' '));
  //return;
  let ff = new ffmpeg_wrapper({bindir: 'C:\\ffmpeg\\bin'});
  let removeextension = ffmpeg.inputs[0].split('.');
  removeextension.pop();
  let newname;
  let output;
  if(ffmpeg.container == 'jpg') {
    newname = removeextension.join('.') + '_demuxed/%01d.' + ffmpeg.container
    output = removeextension.join('.') + '_demuxed';
    cmd = ['-qscale:v 1 -frames:v 60 -vf yadif'];
    try {
      fs.statSync(output);
    } catch(e) {
      fs.mkdirSync(output);
    }
  } else {
    newname = removeextension.join('.') + '_demuxed.' + ffmpeg.container;
    output = newname;
  }
  console.log(newname);
  let preinputcmd = false;
  if(precmd.length > 0) {
    preinputcmd = precmd.join(' ');
  }

  let final = output.split('\\');

  ff.encode({preinputcmd: preinputcmd, in: ffmpeg.inputs, cmd: cmd.join(' '), out: newname}, function(encoder) {

    encodings[ffmpeg.encodingid] = {
      probe: ffmpeg,
      status: 'pending',
      progress: null,
      complete: false,
      message: null,
      encoder: encoder,
      output: final[final.length - 1]
    }

    encoder.on('progress', function(event) {
      //console.log(event);
        if(encodings.hasOwnProperty(ffmpeg.encodingid)) {
          encodings[ffmpeg.encodingid].progress = event;
          encodings[ffmpeg.encodingid].status = 'processing';
        }
    });

    encoder.on('error', function(err) {
        console.log('this happened');
        console.log(err);
        encodings[ffmpeg.encodingid].status = 'error';
        encodings[ffmpeg.encodingid].message = err;
    });

    encoder.on('success', function(out) {
        let keys = Object.keys(out);
        encodings[ffmpeg.encodingid].complete = true;
        for(let i = 0; i < keys.length; i++) {
            if(typeof out[keys[i]] == 'object') {
                console.log(keys[i] + ': ' + out[keys[i]].toString());
            } else {
                console.log(keys[i] + ': ' + out[keys[i]])
            }
        }
        console.log(out.command);
    });
  });
  res.status(200).json({
    status: "success",
    message: 'encoding process has begun',
    uploaduuid: ffmpeg.encodingid,
    //data: '',
    //error: ''
  });
});

router.post('/upload', function(req, res, next) {
  const form = new formidable.IncomingForm({ 
    uploadDir: os.tmpdir(),  // don't forget the __dirname here
    //keepExtensions: false
  })
  form.multiples = false;
  form.maxFileSize = 50 * 1024 * 1024;
  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.log("Error parsing the files");
      return res.status(400).json({
        status: "Fail",
        message: "There was an error parsing the files",
        error: err,
      });
    } else {
      if(uploads.exists(fields.dzuuid)) {
        if(fields.dzchunkindex >= fields.dztotalchunkcount - 1) {
          uploads.addFile(fields.dzuuid, files, function(err, resp) {
            let ffmpeg = new ffmpeg_wrapper({bindir: 'C:\\ffmpeg\\bin'});
            ffmpeg.probe({in: [resp]}, function(err, output) {
              if(err) {
                  res.status(200).json({
                    status: "error",
                    message: err,
                    data: output,
                    error: err,
                  });
              } else {
                /*console.log(output);
                encodings[fields.dzuuid] = {
                  probe: output[0],
                  status: 'pending',
                  progress: null,
                  complete: false,
                  message: null
                }*/
                console.log('Error: ' + err);
                  /*ffmpeg.encode({in: [output[0].probe.format.filename], out: 'C:/Users/Lyas/Desktop/bagger/test.flv'}, function(encoder) {
                    encoder.on('progress', function(event) {
                        if(encodings.hasOwnProperty(fields.dzuuid)) {
                          encodings[fields.dzuuid].progress = event;
                          encodings[fields.dzuuid].status = 'processing';
                        }
                    });

                    encoder.on('error', function(err) {
                        console.log('this happened');
                        console.log(err);
                        encodings[fields.dzuuid].status = 'error';
                        encodings[fields.dzuuid].message = err;
                    });

                    encoder.on('success', function(out) {
                        let keys = Object.keys(out);
                        encodings[fields.dzuuid].complete = true;
                        for(let i = 0; i < keys.length; i++) {
                            if(typeof out[keys[i]] == 'object') {
                                console.log(keys[i] + ': ' + out[keys[i]].toString());
                            } else {
                                console.log(keys[i] + ': ' + out[keys[i]])
                            }
                        }
                        //console.log(out.cmd);
                    });
                  });*/
                return res.status(201).json({
                  status: "success",
                  message: "File successfully uploaded",
                  uploaduuid: fields.dzuuid,
                  data: output,
                  error: err,
                });
              }
            });
          });
          processUpload(fields.dzuuid);
        } else {
          uploads.addFile(fields.dzuuid, files);
          processUpload(fields.dzuuid);
          return res.status(201).json({
            status: "success",
            message: "File successfully uploaded",
            error: err,
          });
        }
      } else {
        uploads.create(fields.dzuuid, files);
        processUpload(fields.dzuuid);
        return res.status(201).json({
          status: "success",
          message: "File successfully uploaded",
          error: err,
        });
      }
    }
  });
});



module.exports = router;
