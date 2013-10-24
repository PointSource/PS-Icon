'use strict';
/*jshint -W117, -W098, -W102, -W016, -W018 */

angular.module('psiconApp')
  .controller('MainCtrl', function ($scope) {
    
    $scope.$on('$viewContentLoaded', function() {
      $scope.sizes = [512, 256, 152, 144, 120, 114, 100, 80, 76, 72, 58, 57, 50, 40, 29];
      $scope.polyFillPerfNow();

      $('#fileSelector').on('change', function(event) {
        $scope.icons = [];
        $scope.blobs = [];
        $scope.iconCounter = 0;
        $scope.blobCounter = 0;
        $scope.fileSelection = event.target.files[0];
        $scope.$apply();

        $scope.$broadcast('fileSelected');
      });

    });

    $scope.$on('fileSelected', function() {
      var reader = new FileReader();
      reader.onload = function(e) {

        angular.forEach($scope.sizes, function (size, index) {
          var imageObject = new Image();
          imageObject.onload = function () {
            var scale = size/1024;
            var scaledCanvas = $scope.downScaleImage(imageObject, scale);
            var scaledImage = scaledCanvas.toDataURL();
            $scope.processBlob(scaledImage, size);
          };
          imageObject.src = reader.result;
          
        });

      };
      //Check file type
      var imageType = /image.png/;

      if ($scope.fileSelection.type.match(imageType)) {
        reader.readAsDataURL($scope.fileSelection);
        $scope.toggleLoader();
      }
      else {
        $scope.fileSelection.error = ' - invalid file extension';
        $scope.$apply();
      }
    });

    $scope.processBlob = function(data, size) {
      var blob = window.dataURLtoBlob && window.dataURLtoBlob(data);
      //console.log('RS Blob', blob);
      var blobObject = {
        blob: blob,
        name: 'icon' + size + '.png',
        src: data,
        size: size
      };
      $scope.blobs.push(blobObject);

      //TODO: May need a check here that is better than length check
      if ($scope.blobs.length === $scope.sizes.length) {
        $scope.$broadcast('finishedBlobs');
      }
    };

    $scope.$on('finishedBlobs', function() {
      console.log('Blobs', $scope.blobs);
      window.requestFileSystem  = window.requestFileSystem || window.webkitRequestFileSystem;
      window.requestFileSystem(window.TEMPORARY, 5*1024*1024, $scope.onInitFs, $scope.fileSystemError);
    });
   
    $scope.onInitFs = function(fs) {
      angular.forEach($scope.blobs, function (blobObject, index) {

        fs.root.getFile(blobObject.name, {create: true}, function (fileEntry) {
          // Create a FileWriter object for our FileEntry (log.txt).
          fileEntry.createWriter(function (fileWriter) {
            fileWriter.onwriteend = function(e) {
              console.log('Write completed.');
              var fileEntryLink = fileEntry.toURL();

              var toPush = {
                src: blobObject.src, 
                href: fileEntryLink, 
                name: blobObject.name,
                size: blobObject.size
              };
              console.log(toPush);
              $scope.icons.push(toPush);
              //TODO: Change to only do this if there are no more, not if the sizes match
              if ($scope.icons.length === $scope.sizes.length) {
                //toggle loader
                $scope.toggleLoader();
                $scope.$apply();
              }

            };

            fileWriter.onerror = function(e) {
              //TODO: 
              //if there are no more images to write
              //toggle loader
              console.log('Write failed: ' + e.toString());
            };

            fileWriter.write(blobObject.blob);

          }, $scope.fileSystemError);
        }, $scope.fileSystemError);

      });
    };

    $scope.fileSystemError = function(err) {
      $scope.toggleLoader();
      var msg = 'An error occured: ';
 
      switch (err.code) { 
      case FileError.NOT_FOUND_ERR: 
        msg += 'File or directory not found'; 
        break;
   
      case FileError.NOT_READABLE_ERR: 
        msg += 'File or directory not readable'; 
        break;
   
      case FileError.PATH_EXISTS_ERR: 
        msg += 'File or directory already exists'; 
        break;
   
      case FileError.TYPE_MISMATCH_ERR: 
        msg += 'Invalid filetype'; 
        break;
   
      default:
        msg += 'Unknown Error'; 
        break;
      }
       
      console.log(msg);
    };

    // scales the image by (float) scale < 1
    // returns a canvas containing the scaled image.
    $scope.downScaleImage = function(img, scale) {
      var imgCV = document.createElement('canvas');
      imgCV.width = img.width;
      imgCV.height = img.height;
      var imgCtx = imgCV.getContext('2d');
      imgCtx.drawImage(img, 0, 0);
      return $scope.downScaleCanvas(imgCV, scale);
    };

    // scales the canvas by (float) scale < 1
    // returns a new canvas containing the scaled image.
    $scope.downScaleCanvas = function(cv, scale) {
      if (!(scale < 1) || !(scale > 0)) {
        throw ('scale must be a positive number <1 ');
      }
      scale = $scope.normaliseScale(scale);
      var sqScale = scale * scale; // square scale =  area of a source pixel within target
      var sw = cv.width; // source image width
      var sh = cv.height; // source image height
      var tw = Math.ceil(sw * scale); // target image width
      var th = Math.ceil(sh * scale); // target image height
      var sx = 0, sy = 0, sIndex = 0; // source x,y, index within source array
      var tx = 0, ty = 0, yIndex = 0, tIndex = 0; // target x,y, x,y index within target array
      var tX = 0, tY = 0; // rounded tx, ty
      var w = 0, nw = 0, wx = 0, nwx = 0, wy = 0, nwy = 0; // weight / next weight x / y
      // weight is weight of current source point within target.
      // next weight is weight of current source point within next target's point.
      var crossX = false; // does scaled px cross its current px right border ?
      var crossY = false; // does scaled px cross its current px bottom border ?
      var sBuffer = cv.getContext('2d').
      getImageData(0, 0, sw, sh).data; // source buffer 8 bit rgba
      var tBuffer = new Float32Array(3 * sw * sh); // target buffer Float32 rgb
      var sR = 0, sG = 0,  sB = 0; // source's current point r,g,b

      for (sy = 0; sy < sh; sy++) {
        ty = sy * scale; // y src position within target
        tY = 0 | ty;     // rounded : target pixel's y
        yIndex = 3 * tY * tw;  // line index within target array
        crossY = (tY !== (0 | ( ty + scale ))); 
        if (crossY) { // if pixel is crossing botton target pixel
          wy = (tY + 1 - ty); // weight of point within target pixel
          nwy = (ty + scale - tY - 1); // ... within y+1 target pixel
        }
        for (sx = 0; sx < sw; sx++, sIndex += 4) {
          tx = sx * scale; // x src position within target
          tX = 0 |  tx;    // rounded : target pixel's x
          tIndex = yIndex + tX * 3; // target pixel index within target array
          crossX = (tX !== (0 | (tx + scale)));
          if (crossX) { // if pixel is crossing target pixel's right
            wx = (tX + 1 - tx); // weight of point within target pixel
            nwx = (tx + scale - tX - 1); // ... within x+1 target pixel
          }
          sR = sBuffer[sIndex    ];   // retrieving r,g,b for curr src px.
          sG = sBuffer[sIndex + 1];
          sB = sBuffer[sIndex + 2];
          if (!crossX && !crossY) { // pixel does not cross
            // just add components weighted by squared scale.
            tBuffer[tIndex    ] += sR * sqScale;
            tBuffer[tIndex + 1] += sG * sqScale;
            tBuffer[tIndex + 2] += sB * sqScale;
          } else if (crossX && !crossY) { // cross on X only
            w = wx * scale;
            // add weighted component for current px
            tBuffer[tIndex    ] += sR * w;
            tBuffer[tIndex + 1] += sG * w;
            tBuffer[tIndex + 2] += sB * w;
            // add weighted component for next (tX+1) px                
            nw = nwx * scale;
            tBuffer[tIndex + 3] += sR * nw;
            tBuffer[tIndex + 4] += sG * nw;
            tBuffer[tIndex + 5] += sB * nw;
          } else if (!crossX && crossY) { // cross on Y only
            w = wy * scale;
            // add weighted component for current px
            tBuffer[tIndex    ] += sR * w;
            tBuffer[tIndex + 1] += sG * w;
            tBuffer[tIndex + 2] += sB * w;
            // add weighted component for next (tY+1) px                
            nw = nwy * scale;
            tBuffer[tIndex + 3 * tw    ] += sR * nw;
            tBuffer[tIndex + 3 * tw + 1] += sG * nw;
            tBuffer[tIndex + 3 * tw + 2] += sB * nw;
          } else { // crosses both x and y : four target points involved
            // add weighted component for current px
            w = wx * wy;
            tBuffer[tIndex    ] += sR * w;
            tBuffer[tIndex + 1] += sG * w;
            tBuffer[tIndex + 2] += sB * w;
            // for tX + 1; tY px
            nw = nwx * wy;
            tBuffer[tIndex + 3] += sR * nw;
            tBuffer[tIndex + 4] += sG * nw;
            tBuffer[tIndex + 5] += sB * nw;
            // for tX ; tY + 1 px
            nw = wx * nwy;
            tBuffer[tIndex + 3 * tw    ] += sR * nw;
            tBuffer[tIndex + 3 * tw + 1] += sG * nw;
            tBuffer[tIndex + 3 * tw + 2] += sB * nw;
            // for tX + 1 ; tY +1 px
            nw = nwx * nwy;
            tBuffer[tIndex + 3 * tw + 3] += sR * nw;
            tBuffer[tIndex + 3 * tw + 4] += sG * nw;
            tBuffer[tIndex + 3 * tw + 5] += sB * nw;
          }
        } // end for sx 
      } // end for sy

      // create result canvas
      var resCV = document.createElement('canvas');
      resCV.width = tw;
      resCV.height = th;
      var resCtx = resCV.getContext('2d');
      var imgRes = resCtx.getImageData(0, 0, tw, th);
      var tByteBuffer = imgRes.data;
      // convert float32 array into a UInt8Clamped Array
      var pxIndex = 0; //  
      for (sIndex = 0, tIndex = 0; pxIndex < tw * th; sIndex += 3, tIndex += 4, pxIndex++) {
        tByteBuffer[tIndex] = 0 | ( tBuffer[sIndex]);
        tByteBuffer[tIndex + 1] = 0 | (tBuffer[sIndex + 1]);
        tByteBuffer[tIndex + 2] = 0 | (tBuffer[sIndex + 2]);
        tByteBuffer[tIndex + 3] = 255;
      }
      // writing result to canvas.
      resCtx.putImageData(imgRes, 0, 0);
      return resCV;
    };
     
    $scope.log2 = function(v) {
      // taken from http://graphics.stanford.edu/~seander/bithacks.html
      var b =  [ 0x2, 0xC, 0xF0, 0xFF00, 0xFFFF0000 ];
      var S =  [1, 2, 4, 8, 16];
      var i=0, r=0;

      for (i = 4; i >= 0; i--) {
        if (v & b[i])  {
          v >>= S[i];
          r |= S[i];
        } 
      }
      
      return r;
    };

    // normalize a scale <1 to avoid some rounding issue with js numbers
    $scope.normaliseScale = function(s) {
      if (s>1) {
        throw('s must be <1');
      }
      s = 0 | (1/s);
      var l = $scope.log2(s);
      var mask = 1 << l;
      var accuracy = 4;
      while(accuracy && l) { l--; mask |= 1<<l; accuracy--; }
      return 1 / ( s & mask );
    };

    $scope.polyFillPerfNow = function() {
      window.performance = window.performance ? window.performance : {};
      window.performance.now =  window.performance.now ||  window.performance.webkitNow ||  window.performance.msNow ||
             window.performance.mozNow || Date.now;
    };

    $scope.toggleLoader = function() {
      $('#loaderScreen').toggle();
    };

  });
