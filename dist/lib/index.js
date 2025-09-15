'use strict';

var pdfNaming = require('../pdf-naming-DkaV7Je3.js');
var index = require('../index.js');
require('@anthropic-ai/sdk');
require('pdf-parse');



exports.correctNameFormat = pdfNaming.correctNameFormat;
exports.extractBasicNominaInfo = pdfNaming.extractBasicNominaInfo;
exports.extractBasicNominaInfoFromText = pdfNaming.extractBasicNominaInfoFromText;
exports.generateGlobalFileName = pdfNaming.generateGlobalFileName;
exports.generateSplitFileName = pdfNaming.generateSplitFileName;
exports.generateTextFileName = pdfNaming.generateTextFileName;
exports.sanitizeFileName = pdfNaming.sanitizeFileName;
exports.validatePeriod = pdfNaming.validatePeriod;
exports.DEFAULT_PAGE_LIMIT = index.DEFAULT_PAGE_LIMIT;
exports.MAX_FILE_SIZE = index.MAX_FILE_SIZE;
exports.SUPPORTED_FORMATS = index.SUPPORTED_FORMATS;
exports.VACLY_VERSION = index.VACLY_VERSION;
exports.cn = index.cn;
exports.createNominaProcessor = index.createNominaProcessor;
exports.extractBasicNominaInfoImproved = index.extractBasicNominaInfoImproved;
exports.parsePDF = index.parsePDF;
