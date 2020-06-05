"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const chalk_1 = __importDefault(require("chalk"));
class Logger {
    constructor(logger, debugMode = false) {
        this.logger = logger;
        this.debugMode = debugMode;
    }
    /**
     * Logs a message inside given namespace.
     */
    log(namespace, message) {
        if (!this.debugMode) {
            return;
        }
        if (Array.isArray(this.debugMode) && !this.debugMode.includes(namespace)) {
            return;
        }
        this.logger(chalk_1.default.grey(`[${namespace}] `) + message);
    }
    /**
     * Sets active namespaces. Pass `true` to enable all logging.
     */
    setDebugMode(debugMode) {
        this.debugMode = debugMode;
    }
}
exports.Logger = Logger;
