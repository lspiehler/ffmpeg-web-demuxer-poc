function createUUID() {
    // http://www.ietf.org/rfc/rfc4122.txt
    var s = [];
    var hexDigits = "0123456789abcdef";
    for (var i = 0; i < 36; i++) {
        s[i] = hexDigits.substr(Math.floor(Math.random() * 0x10), 1);
    }
    s[14] = "4";  // bits 12-15 of the time_hi_and_version field to 0010
    s[19] = hexDigits.substr((s[19] & 0x3) | 0x8, 1);  // bits 6-7 of the clock_seq_hi_and_reserved to 01
    s[8] = s[13] = s[18] = s[23] = "-";

    var uuid = s.join("");
    return uuid;
}

function httpRequest(params, callback) {
    //console.log(params);
    var request = new XMLHttpRequest();
    request.open(params.options.method, params.options.path, true);
    if(params.options.headers) {
        let headerkeys = Object.keys(params.options.headers);
        for(let i = 0; i <= headerkeys.length - 1; i++) {
            request.setRequestHeader(headerkeys[i], params.options.headers[headerkeys]);
        }
    }
    
    request.onload = function() {
        //if (request.status >= 200 && request.status < 301) {
        if(request.status == 401) {
            var resp = {
                id: params.id,
                options: params.options,
                statusCode: request.status,
                body: request.responseText
            }
            callback('401', resp);
        } else {
            try {
                var resp = {
                    statusCode: request.status,
                    body: JSON.parse(request.responseText)
                }
                callback(null, resp);
            } catch(e) {
                var resp = {
                    id: params.id,
                    options: params.options,
                    statusCode: request.status,
                    body: request.responseText
                }
                callback(e, resp);
            }
        }
    };

    request.onerror = function(e) {
        callback(e, null);
        return;
        // There was a connection error of some sort
    };

    if(params.options.method=='POST') {
        request.send(JSON.stringify(params.body));
    } else {
        request.send();
    }
}

var streamManipulator = function(container) {
    var self = this;
    var uploadcard = new uploadCard(self, container);
    var inputs = {};
    var progressuuid;

    this.addUpload = function(probe) {
        let uuid = createUUID();
        probe.uuid = uuid;
        inputs[uuid] = probe;
        uploadcard.draw(probe);
    }

    this.addSubtitle = function(probe) {
        let uuid = createUUID();
        probe.uuid = uuid;
        inputs[uuid] = probe;
        uploadcard.addStream(probe, probe.streams[0]);
    }

    var displayImages = function(dir) {
        let images = document.getElementsByClassName('thumbnail');
        for (let i = 0; i < images.length; i++) {
            console.log(images[i]);
            images[i].parentNode(images[i].remove());
        }
        for (let i = 1; i < 60; i++) {
            let a = document.createElement('a');
            a.className = 'thumbnail';
            a.href = '/download/' + dir + '/' + i + '.jpg?date=' + new Date().getTime();
            a.target = '_blank';
            let image = document.createElement('img');
            image.src = '/download/' + dir + '/' + i + '.jpg?date=' + new Date().getTime();
            image.style.width = '200px';
            a.appendChild(image);
            document.body.appendChild(a);
        }
    }

    var getprogress = function() {
        //var dluuid = uuid;
        let options = {
            path: '/progress/' + progressuuid,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        }

        httpRequest({options: options}, function(err, resp) {
            if(err) {
                //callback(err, resp);
            } else {
                //console.log(dluuid);
                //console.log(resp);
                if(resp.statusCode == 200) {
                    if(resp.body.encoding.complete == false) {
                        if(resp.body.encoding.progress) {
                            //console.log(resp.body.encoding.progress.percent_complete);
                            uploadcard.updateProgress(resp.body.encoding.progress.percent_complete);
                        }
                        setTimeout(function() {
                            getprogress();
                        }, 1000);
                    } else {
                        uploadcard.resetButtons();
                        uploadcard.updateProgress('100');
                        if(resp.body.encoding.probe.container == 'jpg'){
                            displayImages(resp.body.encoding.output);
                            console.log(resp.body);
                        }
                    }
                }
            }
        });
    }

    this.stopEncoding = function() {
        //console.log(ffmpeg);
        let options = {
            path: '/interrupt',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        }

        let body = {
            uuid: progressuuid
        }

        httpRequest({options: options, body: body}, function(err, resp) {
            if(err) {
                //callback(err, resp);
            } else {
                //console.log(dluuid);
                //console.log(resp);
                //if(resp.statusCode == 200 && resp.body.encoding.complete == false) {
                    console.log(resp);
                  /*  if(resp.body.encoding.progress) {
                        console.log(resp.body.encoding.progress.percent_complete);
                    }
                    setTimeout(function() {*/
                        //getprogress(progressuuid);
                    //}, 1000);
                //}
            }
        });
    }

    this.beginEncoding = function(ffmpeg) {
        //console.log(ffmpeg);
        let options = {
            path: '/encode',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        }

        progressuuid = createUUID();
        ffmpeg.encodingid = progressuuid;

        httpRequest({options: options, body: ffmpeg}, function(err, resp) {
            if(err) {
                //callback(err, resp);
            } else {
                //console.log(dluuid);
                //console.log(resp);
                /*if(resp.statusCode == 200 && resp.body.encoding.complete == false) {
                    console.log(resp);
                    if(resp.body.encoding.progress) {
                        console.log(resp.body.encoding.progress.percent_complete);
                    }
                    setTimeout(function() {*/
                        getprogress();
                    //}, 1000);
                //}
            }
        });
    }

    this.getOutput = function() {
        let ffmpeg = {
            outputs: {},
            inputs: [],
            mappings: [],
            encodings: [],
            duration: uploadcard.getOutputDuration()
        }
        console.log(uploadcard.getOutputDuration());
        ffmpeg.container = uploadcard.getContainer();
        let li = uploadcard.getStreams().childNodes;
        for(let i = 0; i < li.length; i++) {
            let streamaction = li[i].getElementsByClassName('streamaction')[0];
            let streamtitle = li[i].getElementsByClassName('streamtitle')[0];
            let streamlanguage = li[i].getElementsByClassName('streamlanguage')[0];
            let stream = JSON.parse(li[i].childNodes[0].value);
            let stv = '';
            if(streamtitle) {
                stv = streamtitle.value || '';
            }
            let slv = '';
            if(streamlanguage) {
                slv = streamlanguage.options[streamlanguage.selectedIndex].value || '';
            }
            if(stv != '' && slv != '') {
                stream.metadata = {}
                if(stv != '') {
                    stream.metadata.title = stv;
                }
                if(slv != '') {
                    stream.metadata.language = slv;
                }
            }
            stream.action = streamaction.options[streamaction.selectedIndex].value;
            if(ffmpeg.outputs.hasOwnProperty(stream.uuid)) {
                ffmpeg.outputs[stream.uuid].streams.push(stream);
            } else {
                ffmpeg.outputs[stream.uuid] = {
                    format: inputs[stream.uuid].format,
                    streams: [stream]
                }
            }
        }
        //console.log(ffmpeg.outputs);
        let keys = Object.keys(ffmpeg.outputs);
        let inputindex = 0;
        for (let i = 0; i < keys.length; i++) {
            ffmpeg.inputs.push(ffmpeg.outputs[keys[i]].format.filename);
            for (let j = 0; j < ffmpeg.outputs[keys[i]].streams.length; j++) {
                let mapping = {};
                mapping[inputindex + ':' + ffmpeg.outputs[keys[i]].streams[j].index] = {
                    action: ffmpeg.outputs[keys[i]].streams[j].action,
                    type: ffmpeg.outputs[keys[i]].streams[j].codec_type
                }
                if(ffmpeg.outputs[keys[i]].streams[j].hasOwnProperty('metadata')) {
                    mapping[inputindex + ':' + ffmpeg.outputs[keys[i]].streams[j].index]['metadata'] = ffmpeg.outputs[keys[i]].streams[j]['metadata'];
                }
                ffmpeg.mappings.push(mapping);
            }
            inputindex++;
        }

        return ffmpeg;
        
    }
}

var videoAction = function(elem) {
    var options = {
        'copy': 'copy',
        'h264': 'libx264 -profile:v baseline -pix_fmt yuv420p -preset veryfast'
    }

    var elem = elem;
    var select = document.createElement('select');
    select.style.marginLeft = '10px';
    select.className = 'streamaction';

    let keys = Object.keys(options);
    for(let i = 0; i < keys.length; i++) {
        let option = document.createElement('option');
        option.text = keys[i];
        option.value = options[keys[i]];
        select.add(option);
    }

    elem.appendChild(select);
}

var audioAction = function(elem) {
    var options = {
        'copy': 'copy',
        'stereo_aac': 'aac -ac 2'
    }

    var elem = elem;
    var select = document.createElement('select');
    select.style.marginLeft = '10px';
    select.className = 'streamaction';

    let keys = Object.keys(options);
    for(let i = 0; i < keys.length; i++) {
        let option = document.createElement('option');
        option.text = keys[i];
        option.value = options[keys[i]];
        select.add(option);
    }

    elem.appendChild(select);
}

var subtitleAction = function(elem) {
    var options = {
        'copy': 'copy'
    }

    var elem = elem;
    var select = document.createElement('select');
    select.style.marginLeft = '10px';
    select.className = 'streamaction';

    let keys = Object.keys(options);
    for(let i = 0; i < keys.length; i++) {
        let option = document.createElement('option');
        option.text = keys[i];
        option.value = options[keys[i]];
        select.add(option);
    }

    elem.appendChild(select);
}

var containerAction = function(elem) {
    var options = {
        'mkv': 'mkv',
        'mp4': 'mp4',
        'flv': 'flv',
        'mov': 'mov',
        'jpg - 60 stills (frames) from begin time': 'jpg'
    }

    var elem = elem;
    var select = document.createElement('select');
    select.style.marginLeft = '10px';
    select.className = 'videocontainer';

    let keys = Object.keys(options);
    for(let i = 0; i < keys.length; i++) {
        let option = document.createElement('option');
        option.text = keys[i];
        option.value = options[keys[i]];
        select.add(option);
    }

    elem.appendChild(select);
}

var streamCard = function(probe, itemindex, li, stream, uploadcard, clonenode) {
    var li = li;
    var stream = stream;
    var card;
    var body = document.createElement('div');
    var input = document.createElement('input');
    var probe = probe;

    //console.log(stream);

    var addHeader = function() {
        li.id = 'stream' + itemindex;
        let headerdiv = document.createElement('div');
        headerdiv.className = 'card-header';
        /*let title = '';
        if(stream.tags.title) {
            title = stream.tags.title
        }*/
        let def = '';
        //console.log(stream);
        if(stream.disposition.default == 1) {
            def = '(default)'
        }
        headerdiv.innerText = stream.codec_type + ' 0:' + stream.index + ' ' + def;
        if(stream.codec_type == 'subtitle') {
            new subtitleAction(headerdiv);
        } else if(stream.codec_type == 'video') {
            new videoAction(headerdiv);
        } else if(stream.codec_type == 'audio') {
            new audioAction(headerdiv);
        } else {

        }
        let buttondel = document.createElement('button');
        buttondel.type = 'button';
        buttondel.className = 'close';
        buttondel.setAttribute('aria-label', 'Close');
        buttondel.style.float = 'right';
        buttondel.style.outline = 'none';
        buttondel.style.border = 'none';
        buttondel.addEventListener('click', function(e) {
            let item = document.getElementById('stream' + itemindex);
            item.remove();
        });
        let spandel = document.createElement('span');
        spandel.innerHTML = '&times;';
        spandel.setAttribute('aria-hidden', 'true');

        buttondel.appendChild(spandel);

        let buttonadd = document.createElement('button');
        buttonadd.type = 'button';
        buttonadd.className = 'close';
        buttonadd.setAttribute('aria-label', 'Close');
        buttonadd.style.float = 'right';
        buttonadd.style.outline = 'none';
        buttonadd.style.border = 'none';
        buttonadd.addEventListener('click', function(e) {
            let item = document.getElementById('stream' + itemindex);
            //let newitem = item.cloneNode(true)
            uploadcard.addStream(probe, stream, item);
            //item.after(item.cloneNode(true))
        });
        let spanadd = document.createElement('span');
        spanadd.innerHTML = '&plus;';
        spanadd.setAttribute('aria-hidden', 'true');

        buttonadd.appendChild(spanadd);
        headerdiv.appendChild(buttondel);
        headerdiv.appendChild(buttonadd);

        card.appendChild(headerdiv);
        //return headerdiv;
    }

    var addBody = function(content) {
        body.className = 'card-body';
        body.innerHTML = content;
        card.appendChild(body);
        //return body;
    }

    card = document.createElement('div');
    card.className = 'card';

    addHeader();

    if(stream.codec_type == 'subtitle') {
        let splitfilename = probe.format.filename.split('\\');
        let title = splitfilename[splitfilename.length - 1];
        let removetitleprefix = title.split('_');
        if(removetitleprefix.length >= 2) {
            removetitleprefix.shift();
            title = removetitleprefix.join('_')
        }
        let titleremovefileextension = title.split('.');
        if(titleremovefileextension.length >= 2) {
            titleremovefileextension.pop()
            title = titleremovefileextension.join('.')
        }
        if(stream.tags) {
            if(stream.tags.title) {
                title = stream.tags.title
            }
        }
        let language = '';
        if(stream.tags) {
            if(stream.tags.language) {
                language = stream.tags.language
            }
        }
        let def = '';
        if(stream.disposition.default == 1) {
            def = '(default)'
        }
        addBody(stream.codec_long_name + ' - ' + language + ' ' + '<input type="text" class="streamtitle" value="' +  title + '" />');
        body.appendChild(getLanguageDropdown(title));
    } else if(stream.codec_type == 'audio') {
        let title = '';
        if(stream.tags.title) {
            title = stream.tags.title
        }
        if(stream.disposition.default == 1) {
            def = '(default)'
        }
        addBody(stream.codec_long_name + ' - ' + stream.channel_layout + ' (' + stream.channels + ' channels) - ' + title);
    } else if(stream.codec_type == 'video') {
        let title = '';
        if(stream.tags.title) {
            title = stream.tags.title
        }
        if(stream.disposition.default == 1) {
            def = '(default)'
        }
        addBody(stream.codec_long_name + ' - ' + title);
    } else {
        console.log('unrecognized stream:');
        console.log(stream);
    }
    input.type = 'hidden';
    input.value = JSON.stringify(stream);
    li.appendChild(input);
    //if(clonenode) {
    //    clonenode.after(card)
    //} else {
        li.appendChild(card);
    //}
}

var getLanguageDropdown = function(language) {
    let languages = document.createElement('select');
    languages.style.width = '200px';
    languages.className = 'streamlanguage';

    let keys = Object.keys(longindex);
    for (let i = 0; i < keys.length; i++) {
        let option = document.createElement('option');
        let friendlyname = keys[i][0].toUpperCase() + keys[i].substring(1).toLowerCase()
        option.innerText = friendlyname;
        option.value = longindex[keys[i]];
        languages.add(option);
        if(keys[i] == language.toUpperCase()) {
            languages.selectedIndex = i
        }
        if(longindex[keys[i]].toUpperCase() == language.toUpperCase()) {
            languages.selectedIndex = i
        }
    }

    return languages;
}

var uploadCard = function(sm, elem) {
    var stream_ul;
    var card;
    var body = document.createElement('div');
    var container = elem;
    var itemindex = 0;
    var self = this;
    var streammanipulator = sm;
    var progressbar;
    var percentcomplete;
    var begin;
    var end;

    this.draw = function(probe) {
        card = document.createElement('div');
        card.className = 'card';

        //console.log(probe);

        let splitfilename = probe.format.filename.split('\\')

        addHeader(splitfilename[splitfilename.length - 1]);
        addBody();
        //addTitle('new test title');
        addList();
        for(let i = 0; i < probe.streams.length; i++) {
            addStream(probe, probe.streams[i]);
        }
        addFooter();
        container.appendChild(card);
        $( function() {
            $( "#sortable" ).sortable({
            placeholder: "ui-state-highlight"
            });
            $( "#sortable" ).disableSelection();
        } );

        var dzoptions = {
            dictDefaultMessage: 'Add Subtitles',
            //chunking: true,
            paramName: "file",
            maxFilesize: 10, // MB
            addRemoveLinks: true,
            url: '/uploadsub',
            init: function () {
                this.on("success", function (file, response) {
                    //console.log("success > " + file.name);
                    //console.log(response);
                    let probe = response.data[0].probe;
                    streammanipulator.addSubtitle(probe);
                });
            }
        };
        var uploader = document.querySelector('#subtitleform');
        //console.log(uploader);
        try {
            var newDropzone = new Dropzone(uploader, dzoptions);
        } catch(e) {
            //don't worry about it
        }
    }

    var addHeader = function(header) {
        let headerdiv = document.createElement('div');
        headerdiv.className = 'card-header';
        headerdiv.innerText = header;
        try {
            let customname = document.getElementById('customname');
            customname.value = header;
        } catch(e) {
            // don't worry about it
        }
        new containerAction(headerdiv);
        card.appendChild(headerdiv);
        return headerdiv;
    }

    this.updateProgress = function(current_progress) {
        //console.log(current_progress);
        //console.log(progressbar);
        if(percentcomplete == current_progress) {
            return;
        } else {
            percentcomplete = current_progress;
        }
        let progress = $(progressbar);
        progress.css("width", current_progress + "%")
        progress.attr("aria-valuenow", current_progress)
        progress.text(current_progress + "% Complete");
    }

    var addFooter = function() {
        let bodydiv = document.createElement('div');
        bodydiv.className = 'card-body';
        let footerdiv = document.createElement('div');
        footerdiv.className = 'card-footer';
        //footerdiv.innerText = header;
        footerdiv.style.textAlign = 'center';
        let progress = document.createElement('div');
        progress.className = 'progress';
        progress.style.width = '100%';
        progressbar = document.createElement('div');
        progressbar.className = 'progress-bar progress-bar-info progress-bar-striped active';
        progressbar.id = 'dynamic';
        progressbar.style.width = '0%';
        progressbar.setAttribute('role', 'progressbar');
        progressbar.setAttribute('aria-valuenow', '0');
        progressbar.setAttribute('aria-valuemin', '0');
        progressbar.setAttribute('aria-valuemax', '100');
        //progressbar.innerHTML = '0% Complete'
        progress.appendChild(progressbar);
        bodydiv.appendChild(progress)
        let button = document.createElement('button');
        let stopbutton = document.createElement('button');
        button.className = 'btn btn-primary';
        button.id = 'encodebtn';
        button.style.marginTop = '40px;'
        button.innerText = 'Encode';
        button.addEventListener('click', function(e) {
            stopbutton.style.display = 'inline';
            e.target.style.display = 'none'
            let ffmpeg = streammanipulator.getOutput();
            streammanipulator.beginEncoding(ffmpeg);
        });
        stopbutton.id = 'stopbtn';
        stopbutton.className = 'btn btn-danger';
        stopbutton.style.marginTop = '40px;'
        stopbutton.style.display = 'none'
        stopbutton.innerText = 'Stop';
        stopbutton.addEventListener('click', function(e) {
            //let ffmpeg = streammanipulator.getOutput();
            button.style.display = "inline";
            e.target.style.display = 'none'
            streammanipulator.stopEncoding();
        });
        footerdiv.appendChild(stopbutton);
        footerdiv.appendChild(button);
        card.appendChild(bodydiv);
        card.appendChild(footerdiv);
    }

    var addAccordion = function() {
        let acc = document.createElement('div');
        acc.id = 'accordionFlush';
        acc.className = 'accordion accordion-flush';
        let accitem = document.createElement('div');
        accitem.className = 'accordion-item';
        let acchead = document.createElement('h2');
        acchead.className = 'accordion-header'
        acchead.id = 'flush-headingOne';
        let button = document.createElement('button');
        button.className = 'accordion-button collapsed';
        button.button = 'button';
        button.innerText = 'Expand to upload SRT subtitles';
        button.setAttribute('data-bs-toggle', 'collapse');
        button.setAttribute('data-bs-target', '#flush-collapseOne');
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-controls', 'flush-collapseOne');
        acchead.appendChild(button);
        let collapseone = document.createElement('div');
        collapseone.id = 'flush-collapseOne';
        collapseone.className = 'accordion-collapse collapse';
        collapseone.setAttribute('aria-labelledby', 'flush-headingOne');
        collapseone.setAttribute('data-bs-parent', '#accordionFlush');
        let content = document.createElement('div');
        content.className = 'accordion-body';
        let subform = document.createElement('div');
        subform.id = 'subtitleform';
        subform.className = 'dropzone';
        //subform.action = '/uploadsub';
        subform.style.width = '100%';
        //subform.style.height = '200px';
        content.appendChild(subform);
        collapseone.appendChild(content);
        acchead.appendChild(collapseone);
        accitem.appendChild(acchead);
        acc.appendChild(accitem);
        return acc;
    }

    var addBody = function(content) {
        body.className = 'card-body';
        //body.innerText = content;

        let spancontain = document.createElement('span');
        spancontain.style.marginBottom = '20px';
        let spanbegin = document.createElement('span');
        spanbegin.innerHTML = 'Begin Time ';
        begin = document.createElement('input');
        begin.className = 'begin';
        begin.value = '';
        begin.type = 'text';
        let spanend = document.createElement('span');
        end = document.createElement('input');
        end.className = 'end';
        end.value = '';
        end.type = 'text';
        spanend.innerHTML = '&nbsp;&nbsp; Duration (relative to begin time) ';

        spancontain.appendChild(spanbegin);
        spancontain.appendChild(begin);
        spancontain.appendChild(spanend);
        spancontain.appendChild(end);

        let accordion = addAccordion();
        body.appendChild(spancontain);
        body.appendChild(accordion);
        card.appendChild(body);
    }

    this.getOutputDuration = function() {
        let b = null;
        let e = null;
        if(begin.value != '') {
            b = begin.value
        }
        if(end.value != '') {
            e = end.value;
        }
        let duration = {
            begin: b,
            end: e
        }
        return duration;
    }

    var addList = function() {
        stream_ul = document.createElement('ul');
        stream_ul.className = 'list-group list-group-flush';
        stream_ul.id = 'sortable';
        card.appendChild(stream_ul);
    }

    var addTitle = function(title) {
        let h5 = document.createElement('h5');
        h5.className = 'card-title';
        h5.innerText = title;
        body.insertBefore(h5, body.firstChild);
    }

    this.getStreams = function() {
        return stream_ul;
    }

    this.getContainer = function() {
        let container = card.getElementsByClassName('videocontainer')[0];
        return container.options[container.selectedIndex].value;
    }

    this.addStream = function(probe, stream, clonenode) {
        addStream(probe, stream, clonenode);
    }

    this.resetButtons = function() {
        let encode = document.getElementById('encodebtn');
        let stop = document.getElementById('stopbtn');
        stop.style.display = 'none';
        encode.style.display = 'inline';
    }

    var addStream = function(probe, stream, clonenode) {
        stream.uuid = probe.uuid;
        let item = document.createElement('li');
        item.className = 'list-group-item';
        if(clonenode) {
            clonenode.after(item)
        } else {
            stream_ul.appendChild(item);
        }
        if(clonenode) {
            new streamCard(probe, itemindex, item, stream, self, clonenode);
        } else {
            new streamCard(probe, itemindex, item, stream, self);
        }
        itemindex++;
    }
}