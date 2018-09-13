var spawn = require('child_process').spawn
var fs = require('fs')
var readline = require('readline')
const osc = require('osc')
var prog = require('caporal')
var createLogger = require('./lib/logger.js').createLogger
var logger = createLogger()
var tidal = null
var feedbackTimer = null
var feedbackToSend = ''

function sanitizeStringForTidal(x) {
    var result = x.replace(/\n/g, '')
    result = result.replace(/\t/g, ' ')
    return result
}


prog
    .version('0.1.0')
    .logger(logger)
    .option('--debug <debug>', 'Enable Debugging', prog.BOOL, false)
    .option('--inoscport <inoscport>', 'osc in port', prog.INT, 7778)
    .option('--outoscport <outoscport>', 'osc out port', prog.INT, 8888)
    .option('--tidalbootfile <tidalbootfile>', 'tidalcycles boot file', null, 'ghciSuperDirt')
    .action(function(args, options, logger) {

        /*************************
          Info about Degugging status
          *************************/
        if (options.debug) {
            logger.info('Debugging Enabled')
        }

        /*************************
          Setting up Tidal on a thread
          *************************/
        tidal = spawn('ghci', ['-XOverloadedStrings'])

        tidal.on('close', function(code) {
            readline.close()
            logger.error('Tidal process exited with code ' + code + '\n')
        })

        readline.createInterface({
            input: tidal.stdout,
            terminal: false
        }).on('line', function(line) {
            logger.info(line)
        })

        readline.createInterface({
            input: tidal.stderr,
            terminal: false
        }).on('line', function(line) {
            logger.error(line)
            feedbackToSend += line + '\n'
            clearTimeout(feedbackTimer)
            feedbackTimer = setTimeout(sendIt, 100)
        }).on('pause', function() {
            logger.info('exit')
        })

        fs.readFile(options.tidalbootfile, 'utf8', function(err, data) {
            if (err) {
                logger.error('Tidal could not read file, ' + options.tidalbootfile + ' : ' + err)
                return
            }
            tidal.stdin.write(data)
            logger.info('Tidal & GHCI initialized')
        })

        var sendIt = function() {
          try {
            udpPort.send({
                address: '/tidal_feedback',
                args: [feedbackToSend]
            }, '127.0.0.1', 8888)

			if (options.debug) {
            	logger.info(feedbackToSend);
            }
          } catch (e) {
            logger.error('OSC return error: ' + e)
          }
          feedbackToSend = ''
        }

        /*************************
         Setting up OSC
         *************************/
        var udpPort = new osc.UDPPort({
            localAddress: '0.0.0.0',
            localPort: options.inoscport
        })

        udpPort.on('bundle', function(oscBundle, timeTag, info) {
            console.log('An OSC bundle just arrived for time tag', timeTag, ':', oscBundle)
            console.log('Remote info is: ', info)
        })

        udpPort.on('message', function(oscMsg) {
            if (options.debug) {
                logger.info(sanitizeStringForTidal(oscMsg.args[0]))
            }
            tidal.stdin.write(sanitizeStringForTidal(oscMsg.args[0]) + '\n')
        })

        // When the port is read, send an OSC message to, say, SuperCollider
        udpPort.on('ready', function() {
            udpPort.send({
                address: '/ready',
                args: ['default', 100]
            }, '127.0.0.1', options.outoscport)
            logger.info('OSC in connection on port: ' + options.inoscport)
            logger.info('OSC out connection on port: ' + options.outoscport)
        })

        // Open the socket.
        udpPort.open()
    })

prog.parse(process.argv)